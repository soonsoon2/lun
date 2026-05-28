import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import { PROVIDERS } from "./providers.js";

const workers = new Map();

function buildAcpCommand(provider, model) {
  if (provider === "kiro") {
    const args = ["acp", "--trust-all-tools"];
    if (model && model !== "auto") args.push("--model", model);
    return { bin: "kiro-cli", args };
  }

  if (provider === "copilot") {
    const args = ["--acp", "--stdio", "--allow-all"];
    if (model && model !== "auto") args.push("--model", model);
    return { bin: "copilot", args };
  }

  throw new Error(`${provider} does not expose an ACP daemon protocol`);
}

function pickPermissionOption(options = []) {
  return (
    options.find(option => option.kind === "allow_always") ||
    options.find(option => option.kind === "allow_once") ||
    options.find(option => /allow|approve|yes|trust/i.test(`${option.kind} ${option.name}`)) ||
    options[0]
  );
}

function contentText(content) {
  if (!content) return "";
  if (content.type === "text") return content.text || "";
  if (typeof content.text === "string") return content.text;
  return "";
}

class AcpWorker {
  constructor({ provider, model, cwd }) {
    this.provider = provider;
    this.model = model || PROVIDERS[provider]?.defaultModel || "auto";
    this.cwd = cwd || process.cwd();
    this.queue = [];
    this.active = null;
    this.child = null;
    this.connection = null;
    this.sessionId = null;
    this.ready = false;
    this.starting = null;
    this.runs = 0;
    this.lastError = null;
    this.agentInfo = null;
    this.startedAt = null;
  }

  async start() {
    if (this.ready && this.child && !this.child.killed) return;
    if (this.starting) return this.starting;

    this.starting = this.doStart().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  async doStart() {
    const { bin, args } = buildAcpCommand(this.provider, this.model);
    const def = PROVIDERS[this.provider] || {};
    const env = { ...process.env, ...(def.env || {}), TERM: "dumb", NO_COLOR: "1" };

    this.child = spawn(bin, args, {
      cwd: def.cwdOverride || this.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.startedAt = Date.now();
    this.ready = false;

    this.child.stderr.on("data", chunk => {
      const text = chunk.toString().trim();
      if (text) this.lastStderr = text.slice(-1000);
    });
    this.child.on("exit", (code, signal) => {
      this.ready = false;
      this.connection = null;
      const message = `${this.provider} ACP worker exited (${signal || code})`;
      this.lastError = message;
      if (this.active) this.finish(this.active, new Error(message));
    });

    const input = Writable.toWeb(this.child.stdin);
    const output = Readable.toWeb(this.child.stdout);
    const stream = acp.ndJsonStream(input, output);
    const client = this.makeClient();
    this.connection = new acp.ClientSideConnection(() => client, stream);

    const init = await this.connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {},
    });
    this.agentInfo = init.agentInfo || null;

    const session = await this.connection.newSession({
      cwd: this.cwd,
      mcpServers: [],
    });
    this.sessionId = session.sessionId;
    this.ready = true;
  }

  makeClient() {
    return {
      requestPermission: async (params) => {
        const option = pickPermissionOption(params.options);
        if (!option?.optionId || /^reject/.test(option.kind || "")) {
          return { outcome: { outcome: "cancelled" } };
        }
        return { outcome: { outcome: "selected", optionId: option.optionId } };
      },
      sessionUpdate: async (params) => {
        const update = params.update;
        if (!this.active || !update) return;

        if (update.sessionUpdate === "agent_message_chunk") {
          const text = contentText(update.content);
          if (text) {
            this.active.text += text;
            if (this.active.onChunk) this.active.onChunk(this.provider, text);
          }
          return;
        }

        if (update.sessionUpdate === "agent_thought_chunk") {
          const text = contentText(update.content);
          if (text && this.active.onChunk) this.active.onChunk(this.provider, `[thinking] ${text}`);
          return;
        }

        if (update.sessionUpdate === "tool_call" && this.active.onChunk) {
          this.active.onChunk(this.provider, `[tool] ${update.title || update.toolCallId || "tool call"}`);
          return;
        }

        if (update.sessionUpdate === "tool_call_update" && this.active.onChunk) {
          this.active.onChunk(this.provider, `[tool] ${update.status || "updated"}`);
        }
      },
      extMethod: async () => ({}),
      extNotification: async () => {},
    };
  }

  run(prompt, { timeout = 120000, onChunk } = {}) {
    return new Promise((resolve, reject) => {
      this.queue.push({ prompt, timeout, onChunk, resolve, reject, text: "" });
      this.pump();
    });
  }

  async pump() {
    if (this.active || !this.queue.length) return;
    const task = this.queue.shift();
    this.active = task;

    try {
      await this.start();
      await this.execute(task);
    } catch (err) {
      this.finish(task, err);
    }
  }

  async execute(task) {
    const started = Date.now();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      this.restart();
      this.finish(task, new Error(`timeout (${task.timeout / 1000}s)`));
    }, task.timeout);

    try {
      const result = await this.connection.prompt({
        sessionId: this.sessionId,
        prompt: [{ type: "text", text: task.prompt }],
      });
      clearTimeout(timer);
      if (timedOut || this.active !== task) return;

      this.runs += 1;
      this.finish(task, null, {
        text: task.text.trim(),
        elapsed: parseFloat(((Date.now() - started) / 1000).toFixed(1)),
        sessionId: this.sessionId,
        provider: this.provider,
        worker: true,
        persistent: true,
        protocol: "acp",
        stopReason: result?.stopReason,
      });
    } catch (err) {
      clearTimeout(timer);
      if (!timedOut) {
        this.restart();
        throw err;
      }
    }
  }

  finish(task, err, result = null) {
    if (this.active !== task) return;
    this.active = null;
    if (err) {
      this.lastError = err.message;
      task.reject(err);
    } else {
      task.resolve(result);
    }
    this.pump();
  }

  restart() {
    this.ready = false;
    this.connection = null;
    if (this.child && !this.child.killed) {
      try { this.child.kill(); } catch {}
    }
    this.child = null;
    this.sessionId = null;
  }

  shutdown() {
    this.queue.splice(0).forEach(task => task.reject(new Error("worker shutdown")));
    if (this.active) this.finish(this.active, new Error("worker shutdown"));
    this.restart();
  }

  status() {
    return {
      provider: this.provider,
      model: this.model,
      cwd: this.cwd,
      alive: !!this.child && !this.child.killed,
      ready: this.ready,
      persistent: true,
      protocol: "acp",
      sessionId: this.sessionId,
      queued: this.queue.length,
      busy: !!this.active,
      runs: this.runs,
      lastError: this.lastError,
      agent: this.agentInfo?.title || this.agentInfo?.name || null,
      uptimeSec: this.startedAt ? Math.round((Date.now() - this.startedAt) / 1000) : 0,
      note: "persistent ACP worker; process stays warm and prompts reuse one session",
    };
  }
}

function keyFor({ provider, model, cwd }) {
  return `${provider}::${model || PROVIDERS[provider]?.defaultModel || "auto"}::${cwd || process.cwd()}`;
}

export function supportsAcpWorker(provider) {
  return provider === "kiro" || provider === "copilot";
}

export function runAcpWorker(provider, prompt, options = {}) {
  const key = keyFor({ provider, model: options.model, cwd: options.cwd });
  let worker = workers.get(key);
  if (!worker) {
    worker = new AcpWorker({ provider, model: options.model, cwd: options.cwd });
    workers.set(key, worker);
  }
  return worker.run(prompt, options);
}

export async function startAcpWorker(provider, options = {}) {
  const key = keyFor({ provider, model: options.model, cwd: options.cwd });
  let worker = workers.get(key);
  if (!worker) {
    worker = new AcpWorker({ provider, model: options.model, cwd: options.cwd });
    workers.set(key, worker);
  }
  await worker.start();
  return worker.status();
}

export function getAcpWorkerStatuses() {
  return [...workers.values()].map(worker => worker.status());
}

export function shutdownAcpWorkers() {
  for (const worker of workers.values()) worker.shutdown();
  workers.clear();
}
