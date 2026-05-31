import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { readFileSync, existsSync } from "fs";
import { PROVIDERS } from "./providers.js";
import { stripAnsi } from "./runner.js";

const workers = new Map();

function cleanOutputLocal(raw) {
  return raw
    .replace(/^Warning:.*$/gm, "")
    .replace(/^All tools are now trusted.*$/gm, "")
    .replace(/^Agents can sometimes.*$/gm, "")
    .replace(/^Learn more at.*$/gm, "")
    .replace(/^YOLO mode.*$/gm, "")
    .replace(/^Ripgrep is not available.*$/gm, "")
    .replace(/^\[STARTUP\].*$/gm, "")
    .replace(/^startup:.*$/gm, "")
    .replace(/^Loaded cached credentials.*$/gm, "")
    .replace(/^Data collection is.*$/gm, "")
    .replace(/^Changes\s+\+\d+\s+-\d+.*$/gm, "")
    .replace(/^Requests\s+\d+.*$/gm, "")
    .replace(/^Tokens\s+.*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

class ManagedAgentWorker {
  constructor({ provider, model, cwd }) {
    this.provider = provider;
    this.model = model || PROVIDERS[provider]?.defaultModel || "auto";
    this.cwd = cwd || process.cwd();
    this.queue = [];
    this.active = null;
    this.child = null;
    this.runs = 0;
    this.lastError = null;
    this.sessionId = provider === "copilot" ? `lun-${randomUUID()}` : null;
  }

  run(prompt, { timeout = 120000, onChunk } = {}) {
    return new Promise((resolve, reject) => {
      this.queue.push({ prompt, timeout, onChunk, resolve, reject });
      this.pump();
    });
  }

  pump() {
    if (this.active || !this.queue.length) return;
    this.active = this.queue.shift();
    this.execute(this.active);
  }

  buildArgs(prompt) {
    const def = PROVIDERS[this.provider];
    if (this.provider === "copilot") {
      const args = ["-p", prompt, "-s", "--allow-all"];
      if (this.model && this.model !== "auto") args.push("--model", this.model);
      if (this.runs === 0) args.push("--name=" + this.sessionId);
      else args.push("--resume=" + this.sessionId);
      return args;
    }

    if (this.provider === "agy") {
      return ["-p", prompt, "--dangerously-skip-permissions", "--print-timeout", `${Math.ceil(this.active.timeout / 1000)}s`, "--add-dir", this.cwd];
    }

    if (this.provider === "kiro") {
      const args = ["chat", "--no-interactive", "--wrap", "never", "--trust-all-tools"];
      if (this.model && this.model !== "auto") args.push("--model", this.model);
      args.push(prompt);
      return args;
    }

    return def.buildArgs(prompt, this.model, {});
  }

  execute(task) {
    const def = PROVIDERS[this.provider];
    if (!def) {
      this.finish(task, new Error(`unknown provider: ${this.provider}`));
      return;
    }

    const args = this.buildArgs(task.prompt);
    const env = { ...process.env, ...(def.env || {}) };
    if (def.envFile && existsSync(def.envFile)) {
      const content = readFileSync(def.envFile, "utf-8");
      for (const line of content.split("\n")) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.+?)["']?$/);
        if (m) env[m[1]] = m[2];
      }
    }

    const started = Date.now();
    let stdout = "";
    let stderr = "";
    const child = spawn(def.bin, args, { cwd: def.cwdOverride || this.cwd, env });
    this.child = child;
    if (child.stdin) child.stdin.end();

    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      this.finish(task, new Error(`timeout (${task.timeout / 1000}s)`));
    }, task.timeout);

    child.stdout.on("data", chunk => {
      const text = chunk.toString();
      stdout += text;
      if (task.onChunk) {
        const cleaned = stripAnsi(text).trim();
        if (cleaned) task.onChunk(this.provider, cleaned);
      }
    });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", err => {
      clearTimeout(timer);
      this.finish(task, err);
    });
    child.on("close", code => {
      clearTimeout(timer);
      const text = cleanOutputLocal(stripAnsi(`${stdout}\n${stderr}`));
      if (!text && code !== 0) {
        this.finish(task, new Error(`${def.bin} exited with code ${code}`));
      } else {
        this.runs += 1;
        this.finish(task, null, {
          text,
          elapsed: parseFloat(((Date.now() - started) / 1000).toFixed(1)),
          sessionId: this.sessionId,
          provider: this.provider,
          worker: true,
        });
      }
    });
  }

  finish(task, err, result = null) {
    if (this.active !== task) return;
    this.child = null;
    this.active = null;
    if (err) {
      this.lastError = err.message;
      task.reject(err);
    } else {
      task.resolve(result);
    }
    this.pump();
  }

  status() {
    return {
      provider: this.provider,
      model: this.model,
      cwd: this.cwd,
      alive: !!this.child && !this.child.killed,
      ready: true,
      persistent: false,
      protocol: "spawn-per-turn",
      sessionId: this.sessionId,
      queued: this.queue.length,
      busy: !!this.active,
      runs: this.runs,
      lastError: this.lastError,
      note: "queued daemon worker; process is spawned per turn because this CLI has no stable stream protocol available",
    };
  }
}

function keyFor({ provider, model, cwd }) {
  return `${provider}::${model || PROVIDERS[provider]?.defaultModel || "auto"}::${cwd || process.cwd()}`;
}

export function runManagedAgentWorker(provider, prompt, options = {}) {
  const key = keyFor({ provider, model: options.model, cwd: options.cwd });
  let worker = workers.get(key);
  if (!worker) {
    worker = new ManagedAgentWorker({ provider, model: options.model, cwd: options.cwd });
    workers.set(key, worker);
  }
  return worker.run(prompt, options);
}

export function getManagedAgentWorkerStatuses() {
  return [...workers.values()].map(worker => worker.status());
}

export function shutdownManagedAgentWorkers() {
  for (const worker of workers.values()) {
    if (worker.child) {
      try { worker.child.kill(); } catch {}
    }
  }
  workers.clear();
}
