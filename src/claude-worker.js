import { spawn } from "child_process";

const workers = new Map();

class ClaudeWorker {
  constructor({ model, cwd }) {
    this.model = model || "sonnet";
    this.cwd = cwd || process.cwd();
    this.child = null;
    this.stdoutBuffer = "";
    this.stderrBuffer = "";
    this.queue = [];
    this.active = null;
    this.sessionId = null;
    this.startedAt = 0;
    this.ready = false;
    this.lastError = null;
    this.runs = 0;
  }

  start() {
    if (this.child && !this.child.killed) return;
    this.ready = false;
    this.lastError = null;
    this.stdoutBuffer = "";
    this.stderrBuffer = "";

    const args = [
      "-p",
      "--input-format", "stream-json",
      "--output-format", "stream-json",
      "--include-partial-messages",
      "--verbose",
      "--model", this.model,
    ];

    this.child = spawn("claude", args, {
      cwd: this.cwd,
      env: { ...process.env, TERM: "dumb", NO_COLOR: "1" },
    });

    this.child.stdout.on("data", chunk => this.handleStdout(chunk.toString()));
    this.child.stderr.on("data", chunk => { this.stderrBuffer += chunk.toString(); });
    this.child.on("error", err => this.failAll(err));
    this.child.on("close", code => {
      const err = new Error(`claude worker exited (${code})${this.stderrBuffer ? `: ${this.stderrBuffer.slice(-500)}` : ""}`);
      this.child = null;
      this.ready = false;
      if (this.active || this.queue.length) this.failAll(err);
    });
  }

  run(prompt, { timeout = 120000, onChunk } = {}) {
    this.start();
    return new Promise((resolve, reject) => {
      this.queue.push({ prompt, timeout, onChunk, resolve, reject, text: "", timer: null });
      this.pump();
    });
  }

  pump() {
    if (this.active || !this.queue.length) return;
    this.start();
    this.active = this.queue.shift();
    this.startedAt = Date.now();
    this.active.timer = setTimeout(() => {
      const timedOut = this.active;
      this.active = null;
      timedOut?.reject(new Error(`timeout (${timedOut.timeout / 1000}s)`));
      this.restart();
      this.pump();
    }, this.active.timeout);

    const message = {
      type: "user",
      message: {
        role: "user",
        content: [{ type: "text", text: this.active.prompt }],
      },
    };
    try {
      this.child.stdin.write(JSON.stringify(message) + "\n");
    } catch (err) {
      clearTimeout(this.active.timer);
      const active = this.active;
      this.active = null;
      active.reject(err);
      this.restart();
      this.pump();
    }
  }

  handleStdout(text) {
    this.stdoutBuffer += text;
    let newline;
    while ((newline = this.stdoutBuffer.indexOf("\n")) !== -1) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      this.handleLine(line);
    }
  }

  handleLine(line) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }

    if (event.type === "system" && event.subtype === "init") {
      this.ready = true;
      this.sessionId = event.session_id || this.sessionId;
      return;
    }

    if (!this.active) return;

    if (event.type === "stream_event") {
      const delta = event.event?.delta;
      if (delta?.type === "text_delta" && delta.text) {
        this.active.text += delta.text;
        if (this.active.onChunk) this.active.onChunk("claude", delta.text);
      }
      return;
    }

    if (event.type === "result") {
      const active = this.active;
      clearTimeout(active.timer);
      this.active = null;
      this.runs += 1;

      if (event.is_error) {
        active.reject(new Error(event.result || event.api_error_status || "claude worker error"));
      } else {
        active.resolve({
          text: (event.result || active.text || "").trim(),
          elapsed: parseFloat(((event.duration_ms || (Date.now() - this.startedAt)) / 1000).toFixed(1)),
          sessionId: event.session_id || this.sessionId,
          provider: "claude",
          usage: event.usage || null,
          worker: true,
        });
      }
      this.pump();
    }
  }

  restart() {
    if (this.child) {
      try { this.child.kill(); } catch {}
    }
    this.child = null;
    this.ready = false;
  }

  failAll(err) {
    this.lastError = err.message;
    if (this.active) {
      clearTimeout(this.active.timer);
      this.active.reject(err);
      this.active = null;
    }
    while (this.queue.length) this.queue.shift().reject(err);
  }

  status() {
    return {
      provider: "claude",
      model: this.model,
      cwd: this.cwd,
      alive: !!this.child && !this.child.killed,
      ready: this.ready,
      persistent: true,
      protocol: "stream-json",
      sessionId: this.sessionId,
      queued: this.queue.length,
      busy: !!this.active,
      runs: this.runs,
      lastError: this.lastError,
      note: "persistent Claude stream-json worker; process stays warm and prompts are written to stdin",
    };
  }
}

function keyFor({ model, cwd }) {
  return `${model || "sonnet"}::${cwd || process.cwd()}`;
}

export function runClaudeWorker(prompt, options = {}) {
  const key = keyFor(options);
  let worker = workers.get(key);
  if (!worker) {
    worker = new ClaudeWorker({ model: options.model, cwd: options.cwd });
    workers.set(key, worker);
  }
  return worker.run(prompt, options);
}

export function startClaudeWorker(options = {}) {
  const key = keyFor(options);
  let worker = workers.get(key);
  if (!worker) {
    worker = new ClaudeWorker({ model: options.model, cwd: options.cwd });
    workers.set(key, worker);
  }
  worker.start();
  return worker.status();
}

export function getClaudeWorkerStatuses() {
  return [...workers.values()].map(worker => worker.status());
}

export function shutdownClaudeWorkers() {
  for (const worker of workers.values()) worker.restart();
  workers.clear();
}
