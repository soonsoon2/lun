import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import { spawn, spawnSync } from "child_process";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync, readdirSync, statSync } from "fs";
import { PROVIDERS, checkAvailable } from "./src/providers.js";
import { runProvider, runAll, stripAnsi, cleanOutput } from "./src/runner.js";
import { moderatedQuery, detectIntent, discuss, synthesize } from "./src/moderator.js";
import { chatTurn } from "./src/lun-agent.js";
import { handleLargePrompt } from "./src/large-prompt.js";
import { Session } from "./src/session.js";
import { loadConfig, defaultConfig, getSessionsDir, saveConfig } from "./src/config.js";
import {
  DAEMON_LOG_PATH,
  DAEMON_STATE_PATH,
  REPORTS_DIR,
  USAGE_LOG_PATH,
  appendDaemonLog,
  appendUsageEvent,
  readDaemonState,
  readNdjson,
  summarizeUsage,
  writeDaemonState,
} from "./src/daemon-store.js";
import { getClaudeWorkerStatuses, shutdownClaudeWorkers, startClaudeWorker } from "./src/claude-worker.js";
import { getAcpWorkerStatuses, shutdownAcpWorkers, startAcpWorker, supportsAcpWorker } from "./src/acp-worker.js";
import { getManagedAgentWorkerStatuses, shutdownManagedAgentWorkers } from "./src/agent-workers.js";
import { getCodexSDKStatuses, prewarmCodexSDK, shutdownCodexSDK } from "./src/codex-sdk-runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.LUN_PORT || process.env.PORT || 3456);
const HOST = process.env.LUN_HOST || process.env.HOST || "127.0.0.1";
const IS_DAEMON = process.env.LUN_DAEMON === "1";
const IS_SERVE = process.env.LUN_SERVE === "1"; // browser-lifecycle mode (close tab => exit)
const DATA_DIR = join(__dirname, "_data");
const THREADS_DIR = join(DATA_DIR, "threads");
const KIRO_SESSIONS_DIR = join(process.env.HOME, ".kiro/sessions/cli");
let actualPort = PORT;
const apiChatHistories = new Map();

// --- Browser-lifecycle watchdog (serve mode only) ---
// The web UI sends heartbeats while a tab is open. If no heartbeat arrives
// within the grace window, we assume the user closed the app and shut down.
const SERVE_GRACE_MS = Number(process.env.LUN_SERVE_GRACE_MS || 12000);
let lastClientPingAt = Date.now();
let serveWatchdog = null;

function shutdownEverything(reason) {
  appendDaemonLog("shutting down", { reason });
  try { shutdownClaudeWorkers(); } catch {}
  try { shutdownAcpWorkers(); } catch {}
  try { shutdownManagedAgentWorkers(); } catch {}
  try { shutdownCodexSDK(); } catch {}
  process.exit(0);
}

function startServeWatchdog() {
  if (!IS_SERVE || serveWatchdog) return;
  serveWatchdog = setInterval(() => {
    if (Date.now() - lastClientPingAt > SERVE_GRACE_MS) {
      shutdownEverything("browser closed (no heartbeat)");
    }
  }, 4000);
  serveWatchdog.unref?.();
}

mkdirSync(THREADS_DIR, { recursive: true });

const app = Fastify({ logger: false });
await app.register(fastifyWebsocket);
await app.register(fastifyStatic, { root: join(__dirname, "public") });

// ============================================================
// HELPERS
// ============================================================

function runKiroCmd(args, cwd) {
  const normalizedArgs = Array.isArray(args) ? args : String(args).split(/\s+/).filter(Boolean);
  const result = spawnSync("kiro-cli", normalizedArgs, {
    encoding: "utf-8",
    timeout: 15000,
    cwd: normalizeCwd(cwd),
    env: { ...process.env, TERM: "dumb", NO_COLOR: "1" },
  });

  if (result.error) return result.error.message || "";
  return `${result.stdout || ""}${result.stderr || ""}`;
}

function normalizeCwd(cwd) {
  const home = process.env.HOME || process.cwd();
  if (typeof cwd !== "string") return home;
  if (!cwd || cwd === "~") return home;
  if (cwd.startsWith("~/")) return join(home, cwd.slice(2));

  try {
    if (existsSync(cwd) && statSync(cwd).isDirectory()) return cwd;
  } catch {}
  return home;
}

function isSafeDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
}

function isSafeThreadId(value) {
  return /^[a-zA-Z0-9._-]+$/.test(value || "");
}

function currentWorkerStatuses() {
  return [
    ...getClaudeWorkerStatuses(),
    ...getAcpWorkerStatuses(),
    ...getManagedAgentWorkerStatuses(),
    ...getCodexSDKStatuses(),
  ];
}

function describeAgentDelta(provider, delta) {
  const text = String(delta || "").trim();
  if (!text) return null;
  const acp = text.match(/^\[acp:([^\]]+)\]\s*(.*)$/);
  if (acp) {
    const phase = acp[1];
    const detail = acp[2] || "";
    return {
      stage: `acp_${phase}`,
      message: `${provider} ACP ${phase}${detail ? ` (${detail})` : ""}`,
      internal: true,
    };
  }
  if (text.startsWith("[thinking]")) {
    return { stage: "agent_thinking", message: `${provider} is thinking`, preview: text.slice(0, 160) };
  }
  if (text.startsWith("[tool]")) {
    return { stage: "agent_tool", message: `${provider} ${text.replace(/^\[tool\]\s*/, "")}` };
  }
  return {
    stage: "agent_chunk",
    message: `${provider} streamed ${text.length} chars`,
    preview: text.slice(0, 160),
  };
}

async function prewarmPersistentWorkers() {
  if (!IS_DAEMON || process.env.LUN_PREWARM_WORKERS === "0") return;
  const config = loadConfig() || defaultConfig();
  const cwd = normalizeCwd(config.defaultCwd || process.cwd());
  const providers = (config.providers || Object.keys(PROVIDERS)).filter(provider => PROVIDERS[provider] && checkAvailable(provider));
  return prewarmProviders(providers, config, cwd);
}

async function prewarmProviders(providers, config = null, cwd = null) {
  config = config || loadConfig() || defaultConfig();
  cwd = cwd || normalizeCwd(config.defaultCwd || process.cwd());
  for (const provider of providers) {
    const model = config.models?.[provider] || PROVIDERS[provider]?.defaultModel;
    try {
      if (supportsAcpWorker(provider)) {
        await startAcpWorker(provider, { model, cwd });
        appendDaemonLog("worker prewarmed", { provider, model, protocol: "acp" });
      } else if (provider === "claude") {
        startClaudeWorker({ model, cwd });
        appendDaemonLog("worker prewarmed", { provider, model, protocol: "stream-json" });
      } else if (provider === "codex") {
        prewarmCodexSDK({ sessionKey: "default", model, cwd });
        appendDaemonLog("worker prewarmed", { provider, model, protocol: "codex-sdk" });
      }
    } catch (err) {
      appendDaemonLog("worker prewarm failed", { provider, model, error: err.message });
    }
  }
}

function threadPath(date, id) {
  if (!isSafeDate(date) || !isSafeThreadId(id)) return null;
  return join(THREADS_DIR, date, id);
}

function readJsonFile(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeMeta(path, meta) {
  writeFileSync(path, JSON.stringify(meta, null, 2));
}

function findSessionForPrompt(promptText, startedAtMs) {
  try {
    const files = readdirSync(KIRO_SESSIONS_DIR)
      .filter(f => f.endsWith(".jsonl"))
      .map(f => {
        const path = join(KIRO_SESSIONS_DIR, f);
        const stat = statSync(path);
        return { path, mtime: stat.mtimeMs, id: f.replace(".jsonl", "") };
      })
      .filter(f => f.mtime >= startedAtMs - 5000)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 12);

    for (const file of files) {
      const lines = readFileSync(file.path, "utf-8").trim().split("\n").filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(lines[i]);
          if (entry.kind !== "Prompt") continue;
          const text = (entry.data?.content || [])
            .filter(part => part.kind === "text")
            .map(part => part.data || "")
            .join("\n")
            .trim();
          if (text === promptText.trim()) return file.id;
          break;
        } catch {}
      }
    }
  } catch { return null; }
  return null;
}

// Parse the last turn from a kiro session file
function parseLastTurn(sessionId) {
  const jsonlPath = join(KIRO_SESSIONS_DIR, `${sessionId}.jsonl`);
  if (!existsSync(jsonlPath)) return null;

  const content = readFileSync(jsonlPath, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);

  // Find the last Prompt and collect everything after it
  let lastPromptIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(lines[i]);
      if (obj.kind === "Prompt") { lastPromptIdx = i; break; }
    } catch {}
  }

  if (lastPromptIdx === -1) return null;

  const turn = [];
  for (let i = lastPromptIdx + 1; i < lines.length; i++) {
    try {
      turn.push(JSON.parse(lines[i]));
    } catch {}
  }

  return formatTurn(turn);
}

// Convert raw turn data into structured messages for the client
function formatTurn(entries) {
  const result = { tools: [], text: "" };

  for (const entry of entries) {
    if (entry.kind === "AssistantMessage") {
      for (const part of entry.data.content) {
        if (part.kind === "text" && part.data) {
          result.text += part.data + "\n";
        } else if (part.kind === "toolUse") {
          const tool = part.data;
          result.tools.push({
            id: tool.toolUseId,
            name: tool.name,
            purpose: tool.input?.__tool_use_purpose || tool.input?.label || tool.name,
            input: tool.input || {},
            result: null,
          });
        }
      }
    } else if (entry.kind === "ToolResults") {
      for (const c of entry.data.content) {
        if (c.kind === "toolResult") {
          const toolId = c.data.toolUseId;
          const existing = result.tools.find(t => t.id === toolId);
          if (existing) {
            existing.result = summarizeToolResult(c.data.content);
          }
        }
      }
    }
  }

  result.text = result.text.trim();
  return result;
}

function summarizeToolResult(content) {
  const parts = [];
  for (const item of content) {
    if (item.kind === "text") {
      parts.push({ type: "text", data: item.data.slice(0, 2000) });
    } else if (item.kind === "json") {
      const d = item.data;
      if (d.exit_status !== undefined) {
        parts.push({ type: "cmd", exitCode: d.exit_status, stdout: (d.stdout || "").slice(0, 500) });
      } else if (d.results) {
        parts.push({ type: "search", count: d.results.length, results: d.results.slice(0, 5).map(r => ({ title: r.title, url: r.url })) });
      } else if (d.content) {
        parts.push({ type: "fetch", content: (d.content || "").slice(0, 300) });
      } else {
        parts.push({ type: "json", data: JSON.stringify(d).slice(0, 500) });
      }
    }
  }
  return parts;
}

function recordProviderRun({ requestId, sessionId, mode, provider, model, status = "ok", latencyMs, inputText = "", outputText = "", error = null }) {
  appendUsageEvent({
    type: "provider_run",
    requestId,
    sessionId,
    mode,
    provider,
    model: model || "auto",
    status,
    latencyMs: Math.max(0, Math.round(latencyMs || 0)),
    inputChars: inputText.length,
    outputChars: outputText.length,
    error,
  });
}

function localFastPath(text) {
  const normalized = text.trim();
  const compact = normalized.replace(/\s+/g, "");
  if (/^(안녕|안녕하세요|하이|hello|hi|hey)[!.?。！ㅋㅎ\s]*$/i.test(normalized)) {
    return "안녕하세요! 무엇을 도와드릴까요?";
  }

  const math = compact.match(/^(-?\d+(?:\.\d+)?)([+\-*/×÷])(-?\d+(?:\.\d+)?)(?:이야|인가|은|는|=|\?)*$/);
  if (math) {
    const a = Number(math[1]);
    const b = Number(math[3]);
    const op = math[2];
    let value;
    if (op === "+") value = a + b;
    else if (op === "-") value = a - b;
    else if (op === "*" || op === "×") value = a * b;
    else if (op === "/" || op === "÷") value = b === 0 ? "0으로는 나눌 수 없어요." : a / b;
    if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8)));
    return value;
  }

  return null;
}

function writeSse(raw, event, data = {}) {
  raw.write(`event: ${event}\n`);
  raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

function collectToolOutputs(toolCalls = []) {
  const output = [];
  for (const call of toolCalls || []) {
    if (Array.isArray(call.children) && call.children.length) {
      for (const child of call.children) output.push(child);
    } else if (call.agent && call.agent !== "all") {
      output.push(call);
    }
  }
  return output;
}

function writeFullReport({ requestId, sessionId, userMessage, summary, toolCalls = [] }) {
  const full = collectToolOutputs(toolCalls);
  if (!full.length) return null;

  mkdirSync(REPORTS_DIR, { recursive: true });
  const safeId = String(requestId || randomUUID()).replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = join(REPORTS_DIR, `${safeId}.md`);
  const parts = [
    "# Lun Full Agent Report",
    "",
    `- Request: ${requestId}`,
    `- Session: ${sessionId}`,
    `- Created: ${new Date().toISOString()}`,
    "",
    "## User Request",
    "",
    userMessage || "",
    "",
    "## Summary",
    "",
    summary || "",
    "",
    "## Full Agent Opinions",
  ];

  for (const item of full) {
    const title = [item.agent || "agent", item.model || "auto", item.elapsed ? `${item.elapsed}s` : ""].filter(Boolean).join(" · ");
    parts.push("", `### ${title}`, "", item.text || "(no response)");
  }

  writeFileSync(path, parts.join("\n"));
  return { path, count: full.length };
}

// ============================================================
// API: GET /api/providers
// ============================================================
app.get("/api/providers", async () => {
  const result = [];
  for (const [id, def] of Object.entries(PROVIDERS)) {
    const check = spawnSync("which", [def.bin], { encoding: "utf-8" });
    result.push({ id, name: def.name, available: check.status === 0 });
  }
  return { providers: result };
});

// ============================================================
// API: daemon dashboard data
// ============================================================
app.get("/api/daemon", async () => {
  return {
    daemon: IS_DAEMON,
    serve: IS_SERVE,
    pid: process.pid,
    host: HOST,
    port: PORT,
    uptimeSec: Math.round(process.uptime()),
    state: readDaemonState(),
    paths: {
      usage: USAGE_LOG_PATH,
      log: DAEMON_LOG_PATH,
      state: DAEMON_STATE_PATH,
      sessions: getSessionsDir(),
    },
  };
});

// ============================================================
// API: POST /api/heartbeat — browser-lifecycle keepalive (serve mode)
// The web UI calls this on an interval while a tab is open.
// ============================================================
app.post("/api/heartbeat", async () => {
  lastClientPingAt = Date.now();
  return { ok: true, serve: IS_SERVE, graceMs: SERVE_GRACE_MS };
});

app.get("/api/workers", async () => {
  const config = loadConfig() || defaultConfig();
  const configuredProviders = config.providers || Object.keys(PROVIDERS);
  const activeWorkers = [
    ...currentWorkerStatuses(),
  ].filter(worker => configuredProviders.includes(worker.provider));
  const activeProviders = new Set(activeWorkers.map(worker => worker.provider));
  const fallbackWorkers = configuredProviders
    .filter(provider => PROVIDERS[provider] && !activeProviders.has(provider))
    .map(provider => {
      const persistent = provider === "codex" || provider === "claude" || supportsAcpWorker(provider);
      const protocol = provider === "codex"
        ? "codex-sdk"
        : provider === "claude"
          ? "stream-json"
          : supportsAcpWorker(provider)
            ? "acp"
            : "spawn-per-turn";
      return {
        provider,
        model: config.models?.[provider] || PROVIDERS[provider]?.defaultModel || "auto",
        alive: false,
        ready: checkAvailable(provider),
        persistent,
        protocol,
        sessionId: null,
        queued: 0,
        busy: false,
        runs: 0,
        lastError: null,
        note: checkAvailable(provider) ? "configured; worker starts on first request" : "configured but executable is unavailable",
      };
    });

  return {
    workers: [...activeWorkers, ...fallbackWorkers],
  };
});

app.get("/api/usage", async (req) => {
  const limit = Number(req.query?.limit || 5000);
  return summarizeUsage(Math.min(Math.max(limit, 100), 20000));
});

app.get("/api/logs", async (req) => {
  const limit = Number(req.query?.limit || 200);
  return { logs: readNdjson(DAEMON_LOG_PATH, Math.min(Math.max(limit, 20), 1000)), path: DAEMON_LOG_PATH };
});

app.post("/api/query/stream", async (req, reply) => {
  const body = req.body || {};
  const text = String(body.text || "").trim();
  if (!text) {
    reply.code(400);
    return { error: "missing text" };
  }

  reply.hijack();
  const raw = reply.raw;
  raw.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    "connection": "keep-alive",
    "x-accel-buffering": "no",
  });
  raw.write(":\n\n");

  let closed = false;
  raw.on("close", () => { closed = true; });
  const send = (event, data = {}) => {
    if (!closed && !raw.destroyed) writeSse(raw, event, data);
  };

  const requestId = randomUUID();
  const sessionId = String(body.sessionId || `api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const mode = body.mode || "chat";
  const cwd = normalizeCwd(body.cwd);
  const config = loadConfig() || defaultConfig();
  const requestedAgents = Array.isArray(body.agents) && body.agents.length > 0 ? body.agents : (config.providers || Object.keys(PROVIDERS));
  const availableProviders = requestedAgents.filter(id => PROVIDERS[id] && checkAvailable(id));
  const timeout = Number(body.timeoutMs || 180000);

  appendUsageEvent({ type: "request", requestId, sessionId, mode, provider: body.provider || "all", inputChars: text.length });
  appendDaemonLog("api stream query received", { requestId, sessionId, mode, provider: body.provider || "all", inputChars: text.length });
  const startedAt = Date.now();
  let heartbeatProviders = new Set(availableProviders);
  const heartbeat = setInterval(() => {
    const elapsed = parseFloat(((Date.now() - startedAt) / 1000).toFixed(1));
    const busyWorkers = currentWorkerStatuses()
      .filter(worker => heartbeatProviders.has(worker.provider) && (worker.busy || worker.queued > 0));
    for (const worker of busyWorkers) {
      send("progress", {
        requestId,
        stage: "heartbeat",
        provider: worker.provider,
        elapsed,
        protocol: worker.protocol,
        phase: worker.phase,
        activeElapsedSec: worker.activeElapsedSec || elapsed,
        queued: worker.queued || 0,
        busy: !!worker.busy,
        message: `${worker.provider} still working (${worker.protocol || "worker"}, ${worker.phase || "busy"}, ${worker.activeElapsedSec || elapsed}s)`,
      });
    }
  }, 5000);
  const endStream = () => {
    clearInterval(heartbeat);
    raw.end();
  };

  try {
    send("progress", { requestId, stage: "received", message: "Lun daemon received the request" });

    const fastAnswer = mode === "chat" || mode === "auto" ? localFastPath(text) : null;
    if (fastAnswer) {
      recordProviderRun({
        requestId,
        sessionId,
        mode,
        provider: "local",
        model: "fast-path",
        latencyMs: 0,
        inputText: text,
        outputText: fastAnswer,
      });
      send("done", { ok: true, requestId, sessionId, mode, fastPath: true, results: [{ provider: "local", model: "fast-path", text: fastAnswer, elapsed: 0 }] });
      endStream();
      return;
    }

    if (mode !== "chat") {
      send("progress", { requestId, stage: "route_start", message: `${mode} mode is routing agents` });
      const routed = await moderatedQuery(text, availableProviders, {
        models: config.models || {},
        cwd,
        timeout,
        onRoute: (plan) => {
          heartbeatProviders = new Set(plan.providers);
          send("progress", {
            requestId,
            stage: "route",
            intent: plan.intent,
            strategy: plan.strategy,
            providers: plan.providers,
            message: `Routing to ${plan.providers.join(", ")}`,
          });
        },
        onChunk: (provider, delta) => {
          const described = describeAgentDelta(provider, delta);
          if (!described) return;
          send("progress", { requestId, provider, ...described });
        },
        onResult: (r) => {
          recordProviderRun({
            requestId,
            sessionId,
            mode,
            provider: r.provider,
            model: config.models?.[r.provider],
            status: r.error ? "error" : "ok",
            latencyMs: (r.elapsed || 0) * 1000,
            inputText: text,
            outputText: r.text || "",
            error: r.error ? r.text : null,
          });
          send("progress", {
            requestId,
            stage: "agent_result",
            provider: r.provider,
            elapsed: r.elapsed || 0,
            message: `${r.provider} finished in ${r.elapsed || 0}s`,
          });
        },
      });
      send("done", { ok: true, requestId, sessionId, mode, intent: routed.intent, strategy: routed.strategy, skippedNote: routed.skippedNote, results: routed.results });
      endStream();
      return;
    }

    const pmAgent = config.pmAgent || "claude";
    const pmModel = config.pmModel || config.models?.[pmAgent];
    const reportStyle = body.reportStyle === "detailed" ? "detailed" : "brief";
    const history = apiChatHistories.get(sessionId) || [];
    const lastProgressAt = new Map();

    const sendProgress = (stage, provider, message, data = {}, minIntervalMs = 0) => {
      const key = `${stage}:${provider || ""}:${message}`;
      const now = Date.now();
      const last = lastProgressAt.get(key) || 0;
      if (minIntervalMs && now - last < minIntervalMs) return;
      lastProgressAt.set(key, now);
      send("progress", { requestId, stage, provider, message, ...data });
    };

    sendProgress("pm_start", pmAgent, `${pmAgent} PM is planning the request`, { model: pmModel || "auto" });

    const result = await chatTurn({
      pmAgent,
      pmModel,
      availableAgents: availableProviders,
      history,
      userMessage: text,
      models: config.models || {},
      cwd,
      timeout,
      reportStyle,
      onPMThinking: (round) => {
        sendProgress("pm_thinking", pmAgent, `${pmAgent} PM thinking, round ${round + 1}`, { round: round + 1 });
      },
      onPMChunk: (provider, chunk) => {
        sendProgress("pm_streaming", provider, `${provider} is drafting or routing`, { chunkChars: chunk?.length || 0 }, 12000);
      },
      onToolCall: (agent, prompt) => {
        sendProgress("tool_call", agent, agent === "all" ? "Calling all available specialist agents" : `Calling ${agent}`, { inputChars: prompt.length });
        if (agent === "all") heartbeatProviders = new Set(availableProviders.filter(id => id !== pmAgent));
        else heartbeatProviders.add(agent);
      },
      onToolChunk: (provider, delta) => {
        const described = describeAgentDelta(provider, delta);
        if (described?.internal) {
          sendProgress(described.stage, provider, described.message, { preview: described.preview }, 0);
        } else if (described) {
          sendProgress(described.stage, provider, described.message, { preview: described.preview }, 12000);
        } else {
          sendProgress("tool_streaming", provider, `${provider} is responding`, {}, 12000);
        }
      },
      onToolResult: (agent, output, elapsed) => {
        recordProviderRun({
          requestId,
          sessionId,
          mode,
          provider: agent,
          model: config.models?.[agent],
          latencyMs: (elapsed || 0) * 1000,
          inputText: text,
          outputText: output || "",
        });
        send("progress", {
          requestId,
          stage: "tool_result",
          provider: agent,
          elapsed: elapsed || 0,
          outputChars: (output || "").length,
          message: `${agent} finished in ${elapsed || 0}s`,
        });
      },
    });

    recordProviderRun({
      requestId,
      sessionId,
      mode,
      provider: pmAgent,
      model: pmModel,
      latencyMs: (result.elapsed || 0) * 1000,
      inputText: text,
      outputText: result.response || "",
    });

    history.push({ user: text, assistant: result.response });
    while (history.length > 10) history.shift();
    apiChatHistories.set(sessionId, history);
    const report = writeFullReport({
      requestId,
      sessionId,
      userMessage: text,
      summary: result.response,
      toolCalls: result.toolCalls,
    });

    send("done", {
      ok: true,
      requestId,
      sessionId,
      mode,
      results: [{ provider: pmAgent, model: pmModel || "auto", text: result.response, elapsed: result.elapsed }],
      toolCalls: result.toolCalls,
      report,
    });
    endStream();
  } catch (err) {
    recordProviderRun({ requestId, sessionId, mode, provider: body.provider || "daemon", status: "error", inputText: text, error: err.message });
    send("error", { error: err.message, requestId, sessionId });
    endStream();
  }
});

app.post("/api/query", async (req, reply) => {
  const body = req.body || {};
  const text = String(body.text || "").trim();
  if (!text) {
    reply.code(400);
    return { error: "missing text" };
  }

  const requestId = randomUUID();
  const sessionId = String(body.sessionId || `api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const mode = body.mode || "ask";
  const cwd = normalizeCwd(body.cwd);
  const config = loadConfig() || defaultConfig();
  const requestedAgents = Array.isArray(body.agents) && body.agents.length > 0 ? body.agents : (config.providers || Object.keys(PROVIDERS));
  const availableProviders = requestedAgents.filter(id => PROVIDERS[id] && checkAvailable(id));

  appendUsageEvent({ type: "request", requestId, sessionId, mode, provider: body.provider || "all", inputChars: text.length });
  appendDaemonLog("api query received", { requestId, sessionId, mode, provider: body.provider || "all", inputChars: text.length });

  try {
    const fastAnswer = mode === "chat" || mode === "auto" ? localFastPath(text) : null;
    if (fastAnswer) {
      recordProviderRun({
        requestId,
        sessionId,
        mode,
        provider: "local",
        model: "fast-path",
        latencyMs: 0,
        inputText: text,
        outputText: fastAnswer,
      });
      return { ok: true, requestId, sessionId, mode, fastPath: true, results: [{ provider: "local", model: "fast-path", text: fastAnswer, elapsed: 0 }] };
    }

    if (mode === "chat") {
      const pmAgent = config.pmAgent || "claude";
      const pmModel = config.pmModel || config.models?.[pmAgent];
      const history = apiChatHistories.get(sessionId) || [];
      const result = await chatTurn({
        pmAgent,
        pmModel,
        availableAgents: availableProviders,
        history,
        userMessage: text,
        models: config.models || {},
        cwd,
        timeout: Number(body.timeoutMs || 180000),
        onToolResult: (agent, output, elapsed) => {
          recordProviderRun({
            requestId,
            sessionId,
            mode,
            provider: agent,
            model: config.models?.[agent],
            latencyMs: (elapsed || 0) * 1000,
            inputText: text,
            outputText: output || "",
          });
        },
      });

      recordProviderRun({
        requestId,
        sessionId,
        mode,
        provider: pmAgent,
        model: pmModel,
        latencyMs: (result.elapsed || 0) * 1000,
        inputText: text,
        outputText: result.response || "",
      });

      history.push({ user: text, assistant: result.response });
      while (history.length > 10) history.shift();
      apiChatHistories.set(sessionId, history);
      const report = writeFullReport({
        requestId,
        sessionId,
        userMessage: text,
        summary: result.response,
        toolCalls: result.toolCalls,
      });
      return { ok: true, requestId, sessionId, mode, results: [{ provider: pmAgent, model: pmModel || "auto", text: result.response, elapsed: result.elapsed }], toolCalls: result.toolCalls, report };
    }

    if (mode === "single" && body.provider) {
      const providerId = body.provider;
      if (!PROVIDERS[providerId] || !checkAvailable(providerId)) {
        reply.code(400);
        return { error: `provider unavailable: ${providerId}` };
      }
      const model = body.model || config.models?.[providerId];
      const run = await runProvider(providerId, text, {
        model,
        sessionId: providerId === "codex" ? sessionId : undefined,
        cwd,
        timeout: Number(body.timeoutMs || 180000),
      });
      recordProviderRun({
        requestId,
        sessionId,
        mode,
        provider: providerId,
        model,
        latencyMs: (run.elapsed || 0) * 1000,
        inputText: text,
        outputText: run.text || "",
      });
      return { ok: true, requestId, sessionId, mode, results: [{ provider: providerId, model: model || "auto", text: run.text, elapsed: run.elapsed }] };
    }

    const routed = await moderatedQuery(text, availableProviders, {
      models: config.models || {},
      cwd,
      timeout: Number(body.timeoutMs || 180000),
      onResult: (r) => {
        recordProviderRun({
          requestId,
          sessionId,
          mode,
          provider: r.provider,
          model: config.models?.[r.provider],
          status: r.error ? "error" : "ok",
          latencyMs: (r.elapsed || 0) * 1000,
          inputText: text,
          outputText: r.text || "",
          error: r.error ? r.text : null,
        });
      },
    });

    return { ok: true, requestId, sessionId, mode, intent: routed.intent, strategy: routed.strategy, skippedNote: routed.skippedNote, results: routed.results };
  } catch (err) {
    recordProviderRun({ requestId, sessionId, mode, provider: body.provider || "daemon", status: "error", inputText: text, error: err.message });
    reply.code(500);
    return { error: err.message, requestId, sessionId };
  }
});

// ============================================================
// API: GET /api/sessions
// ============================================================
app.get("/api/sessions", async () => {
  const { listSessions } = await import("./src/session.js");
  const { getSessionsDir } = await import("./src/config.js");
  return { sessions: listSessions(20), path: getSessionsDir() };
});

// ============================================================
// API: GET /api/sessions/:id
// ============================================================
app.get("/api/sessions/:id", async (req) => {
  const { getSessionsDir } = await import("./src/config.js");
  const sessDir = getSessionsDir();
  const filePath = join(sessDir, `${req.params.id}.json`);
  if (!existsSync(filePath)) return { error: "not found" };
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch { return { error: "parse error" }; }
});

// ============================================================
// API: GET /api/provider-models
// ============================================================
app.get("/api/provider-models", async () => {
  const result = {};
  for (const [id, def] of Object.entries(PROVIDERS)) {
    if (checkAvailable(id)) {
      result[id] = def.getModels ? def.getModels() : [];
    }
  }
  const config = loadConfig() || defaultConfig();
  return { models: result, moderator: config.moderator || "claude" };
});

// ============================================================
// API: GET /api/config — full settings snapshot for the control panel
// ============================================================
app.get("/api/config", async () => {
  const config = loadConfig() || defaultConfig();
  const providers = [];
  for (const [id, def] of Object.entries(PROVIDERS)) {
    const available = checkAvailable(id);
    providers.push({
      id,
      name: def.name,
      available,
      defaultModel: def.defaultModel,
      configured: (config.providers || []).includes(id),
      selectedModel: config.models?.[id] || def.defaultModel,
      models: available && def.getModels ? def.getModels() : [],
    });
  }
  return {
    config: {
      providers: config.providers || [],
      models: config.models || {},
      pmAgent: config.pmAgent || "claude",
      pmModel: config.pmModel || config.models?.[config.pmAgent || "claude"] || "auto",
      moderator: config.moderator || config.pmAgent || "claude",
      timeout: config.timeout || 120,
      language: config.language || "en",
    },
    providers,
  };
});

// ============================================================
// API: POST /api/config — update settings (PM agent, per-agent models, providers)
// Body: { pmAgent?, pmModel?, models?: {id:model}, providers?: [], timeout? }
// ============================================================
app.post("/api/config", async (req, reply) => {
  const body = req.body || {};
  const config = loadConfig() || defaultConfig();

  if (typeof body.pmAgent === "string") {
    if (!PROVIDERS[body.pmAgent]) { reply.code(400); return { error: `unknown pmAgent: ${body.pmAgent}` }; }
    if (!checkAvailable(body.pmAgent)) { reply.code(400); return { error: `${body.pmAgent} is not installed` }; }
    config.pmAgent = body.pmAgent;
    config.moderator = body.pmAgent; // PM doubles as moderator
  }
  if (typeof body.pmModel === "string") config.pmModel = body.pmModel;
  if (body.models && typeof body.models === "object") {
    config.models = { ...config.models, ...body.models };
  }
  if (Array.isArray(body.providers)) {
    config.providers = body.providers.filter(id => PROVIDERS[id]);
  }
  if (Number.isFinite(body.timeout)) config.timeout = body.timeout;

  saveConfig(config);
  appendDaemonLog("config updated via web", {
    pmAgent: config.pmAgent, pmModel: config.pmModel, providers: config.providers,
  });
  return { ok: true, config };
});

// ============================================================
// API: POST /api/workers/restart — restart warm workers (all or one provider)
// Body: { provider?: "kiro" }  — omit provider to restart everything
// ============================================================
app.post("/api/workers/restart", async (req) => {
  const body = req.body || {};
  const target = body.provider;
  const config = loadConfig() || defaultConfig();

  // Simplest correct approach: tear all workers down, then re-prewarm the
  // requested set. Per-worker surgical restart isn't worth the complexity.
  shutdownClaudeWorkers();
  shutdownAcpWorkers();
  shutdownManagedAgentWorkers();
  shutdownCodexSDK();

  const all = (config.providers || Object.keys(PROVIDERS)).filter(p => PROVIDERS[p] && checkAvailable(p));
  const toWarm = target ? all.filter(p => p === target) : all;
  await prewarmProviders(toWarm, config);
  appendDaemonLog("workers restarted via web", { target: target || "all", warmed: toWarm });
  return { ok: true, restarted: target || "all", warmed: toWarm };
});

// ============================================================
// API: GET /api/pricing — the cost rate table (for transparency in the UI)
// ============================================================
app.get("/api/pricing", async () => {
  const { RATES, DEFAULT_RATE, CHARS_PER_TOKEN } = await import("./src/pricing.js");
  return { rates: RATES, defaultRate: DEFAULT_RATE, charsPerToken: CHARS_PER_TOKEN, note: "Estimated USD per 1M tokens [input, output]. Token counts are approximated from characters." };
});

// ============================================================
// API: POST /api/moderator
// ============================================================
app.post("/api/moderator", async (req) => {
  const { moderator } = req.body || {};
  if (!moderator) return { error: "missing moderator" };
  const config = loadConfig() || defaultConfig();
  config.moderator = moderator;
  const { saveConfig: save } = await import("./src/config.js");
  save(config);
  return { ok: true, moderator };
});

// ============================================================
// API: GET /api/models
// ============================================================
app.get("/api/models", async () => {
  const raw = runKiroCmd(["chat", "--list-models", "--format", "json"]);
  try { return JSON.parse(raw); } catch { return { models: [], error: "parse_failed" }; }
});

// ============================================================
// API: GET /api/agents
// ============================================================
app.get("/api/agents", async () => {
  const raw = runKiroCmd(["agent", "list"]);
  const clean = stripAnsi(raw);
  const agents = [];
  for (const line of clean.split("\n")) {
    const match = line.match(/^([* ])\s{1,3}(\S+)\s+(Global|Workspace|\(Built-in\)|Built-in)\s*(.*)?$/);
    if (match) {
      agents.push({ name: match[2], location: match[3].replace(/[()]/g, ""), description: (match[4] || "").trim(), active: match[1] === "*" });
    }
  }
  return { agents };
});

// ============================================================
// API: GET /api/threads
// ============================================================
app.get("/api/threads", async () => {
  const threads = [];
  if (!existsSync(THREADS_DIR)) return { threads };
  for (const dateDir of readdirSync(THREADS_DIR)) {
    const datePath = join(THREADS_DIR, dateDir);
    try {
      for (const threadId of readdirSync(datePath)) {
        const metaPath = join(datePath, threadId, "meta.json");
        const meta = existsSync(metaPath) ? readJsonFile(metaPath) : null;
        if (meta) threads.push({ ...meta, id: meta.id || threadId, date: meta.date || dateDir });
      }
    } catch {}
  }
  threads.sort((a, b) => new Date(b.created) - new Date(a.created));
  return { threads };
});

app.get("/api/threads/:date/:id/messages", async (req) => {
  const { date, id } = req.params;
  const basePath = threadPath(date, id);
  if (!basePath) return { messages: [] };
  const msgPath = join(basePath, "messages.ndjson");
  if (!existsSync(msgPath)) return { messages: [] };
  const lines = readFileSync(msgPath, "utf-8").trim().split("\n").filter(Boolean);
  return { messages: lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) };
});

// ============================================================
// WEBSOCKET: /ws
// ============================================================
app.get("/ws", { websocket: true }, (socket, req) => {
  console.log("[ws] client connected");

  let sessionId = null;
  let sessionDate = null;
  let kiroSessionId = null;
  let threadDir = null;
  let sessionOptions = {};
  let activeChild = null;
  let provider = "kiro";
  // Per-provider session tracking for multi-turn
  let providerSessions = { kiro: null, claude: null, copilot: null };
  // PM chat history (for chat mode)
  let chatHistory = [];
  // Stop signal for long-running discussions (set by a "stop" message).
  let stopRequested = false;

  socket.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      switch (msg.type) {
        case "start": {
          const existingPath = threadPath(msg.threadDate, msg.threadId);
          provider = msg.provider || "kiro";
          sessionOptions = {
            model: msg.model,
            agent: msg.agent,
            resumeId: msg.resumeId,
            cwd: normalizeCwd(msg.cwd),
            provider,
            keepSession: msg.keepSession !== false, // default true
          };

          sessionId = msg.threadId && isSafeThreadId(msg.threadId)
            ? msg.threadId
            : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          sessionDate = msg.threadDate && isSafeDate(msg.threadDate)
            ? msg.threadDate
            : new Date().toISOString().slice(0, 10);
          kiroSessionId = msg.resumeId || null;

          if (existingPath && existsSync(existingPath)) {
            threadDir = existingPath;
            const meta = readJsonFile(join(threadDir, "meta.json"), {});
            kiroSessionId = kiroSessionId || meta.kiroSessionId || null;
          } else {
            threadDir = join(THREADS_DIR, sessionDate, sessionId);
            mkdirSync(threadDir, { recursive: true });
            writeMeta(join(threadDir, "meta.json"), {
              id: sessionId,
              date: sessionDate,
              model: sessionOptions.model || "auto",
              agent: sessionOptions.agent || "default",
              provider: provider,
              title: "",
              created: new Date().toISOString(),
              cwd: sessionOptions.cwd,
              resumedFrom: sessionOptions.resumeId || null,
              kiroSessionId,
            });
          }

          socket.send(JSON.stringify({ type: "ready", sessionId, date: sessionDate }));
          console.log(`[session] created ${sessionId}`);
          break;
        }

        case "stop": {
          stopRequested = true;
          socket.send(JSON.stringify({ type: "system", text: "Stopping after the current turn..." }));
          break;
        }

        case "message": {
          if (activeChild) {
            socket.send(JSON.stringify({ type: "error", message: "이전 응답이 아직 진행 중입니다" }));
            break;
          }

          let text = msg.text;
          if (!text) break;
          stopRequested = false;
          const requestId = randomUUID();
          const mode = provider === "all" ? (msg.mode || (msg.discuss ? "discuss" : "ask")) : "single";
          appendUsageEvent({
            type: "request",
            requestId,
            sessionId,
            mode,
            provider,
            inputChars: text.length,
          });
          appendDaemonLog("request received", { requestId, sessionId, mode, provider, inputChars: text.length });

          const fastAnswer = (mode === "chat" || mode === "lun") ? localFastPath(text) : null;
          if (fastAnswer) {
            socket.send(JSON.stringify({ type: "provider-response", provider: "local", text: fastAnswer, elapsed: 0, model: "fast-path" }));
            recordProviderRun({
              requestId,
              sessionId,
              mode,
              provider: "local",
              model: "fast-path",
              latencyMs: 0,
              inputText: text,
              outputText: fastAnswer,
            });
            chatHistory.push({ user: text, assistant: fastAnswer });
            if (chatHistory.length > 10) chatHistory.shift();
            socket.send(JSON.stringify({ type: "done" }));
            break;
          }

          // Auto-offload large prompts to temp file
          const largeResult = handleLargePrompt(text);
          if (largeResult.offloaded) {
            text = largeResult.prompt;
            socket.send(JSON.stringify({ type: "system", text: `Large prompt (${msg.text.length} chars) offloaded to ${largeResult.filePath}` }));
          }

          // Save user message
          if (threadDir) {
            appendFileSync(join(threadDir, "messages.ndjson"),
              JSON.stringify({ ts: Date.now(), role: "user", content: text }) + "\n");
            const metaPath = join(threadDir, "meta.json");
            const meta = readJsonFile(metaPath, {});
            if (!meta.title) {
              meta.title = text.slice(0, 50);
              writeMeta(metaPath, meta);
            }
          }

          // "all" mode: moderated multi-agent query
          if (provider === "all") {
            const requestedAgents = msg.agents && msg.agents.length > 0 ? msg.agents : null;
            const availableProviders = Object.keys(PROVIDERS).filter(id => checkAvailable(id) && (!requestedAgents || requestedAgents.includes(id)));

            // Lun mode (formerly "chat") — PM analyzes intent, delegates in
            // parallel, returns a synthesized report. Default = brief opinion.
            if (msg.mode === "chat" || msg.mode === "lun") {
              const config = loadConfig() || defaultConfig();
              const pmAgent = config.pmAgent || "claude";
              const pmModel = config.pmModel || config.models?.[pmAgent];
              const reportStyle = msg.reportStyle === "detailed" ? "detailed" : "brief";

              if (!checkAvailable(pmAgent)) {
                socket.send(JSON.stringify({ type: "error", message: `PM agent "${pmAgent}" not installed` }));
                socket.send(JSON.stringify({ type: "done" }));
                break;
              }

              socket.send(JSON.stringify({ type: "provider-thinking", provider: pmAgent }));

              chatTurn({
                pmAgent,
                pmModel,
                availableAgents: availableProviders,
                history: chatHistory,
                userMessage: text,
                models: config.models || {},
                cwd: sessionOptions.cwd,
                timeout: 180000,
                reportStyle,
                onToolCall: (agent, prompt) => {
                  socket.send(JSON.stringify({ type: "system", text: `→ Calling ${agent}: ${prompt.slice(0, 60)}${prompt.length > 60 ? "..." : ""}` }));
                  socket.send(JSON.stringify({ type: "provider-thinking", provider: agent }));
                },
                onToolResult: (agent, result, elapsed) => {
                  socket.send(JSON.stringify({ type: "provider-response", provider: agent, text: result, elapsed }));
                  recordProviderRun({
                    requestId,
                    sessionId,
                    mode,
                    provider: agent,
                    model: config.models?.[agent],
                    latencyMs: (elapsed || 0) * 1000,
                    inputText: text,
                    outputText: result || "",
                  });
                },
              }).then((result) => {
                // PM's final synthesis
                socket.send(JSON.stringify({ type: "provider-response", provider: pmAgent, text: result.response, elapsed: result.elapsed, model: pmModel }));
                recordProviderRun({
                  requestId,
                  sessionId,
                  mode,
                  provider: pmAgent,
                  model: pmModel,
                  latencyMs: (result.elapsed || 0) * 1000,
                  inputText: text,
                  outputText: result.response || "",
                });
                chatHistory.push({ user: text, assistant: result.response });
                if (chatHistory.length > 10) chatHistory.shift();
                try {
                  const session = new Session();
                  session.addTurn(text, [{ provider: pmAgent, text: result.response, elapsed: result.elapsed, model: pmModel || "auto" }]);
                } catch {}
                socket.send(JSON.stringify({ type: "done" }));
              }).catch(err => {
                recordProviderRun({
                  requestId,
                  sessionId,
                  mode,
                  provider: pmAgent,
                  model: pmModel,
                  status: "error",
                  inputText: text,
                  error: err.message,
                });
                socket.send(JSON.stringify({ type: "error", message: err.message }));
                socket.send(JSON.stringify({ type: "done" }));
              });
              break;
            }

            // Discuss mode — relay-style, PM-moderated, with techniques.
            if (msg.discuss || msg.mode === "discuss") {
              const config = loadConfig() || defaultConfig();
              const moderatorId = config.pmAgent || config.moderator || "claude";
              const moderatorModel = config.pmModel || config.models?.[moderatorId];

              if (!checkAvailable(moderatorId)) {
                socket.send(JSON.stringify({ type: "error", message: `PM/moderator "${moderatorId}" not installed` }));
                socket.send(JSON.stringify({ type: "done" }));
                break;
              }

              // Unlimited when maxTurns explicitly 0; else use provided/config/default.
              const maxTurns = msg.maxTurns === 0 ? 0 : (msg.maxTurns || config.autoDiscuss?.maxTurns || 3);
              const maxTime = msg.maxTime === 0 ? 0 : (msg.maxTime || config.autoDiscuss?.maxTime || 120);
              const technique = msg.technique || "auto";

              socket.send(JSON.stringify({ type: "moderator-msg", text: `Moderating a relay discussion on:\n\n"${text}"` }));

              discuss(text, availableProviders, {
                moderator: moderatorId,
                moderatorModel: moderatorModel,
                models: config.models || {},
                technique,
                maxTurns,
                maxTime,
                turnTimeout: 45000,
                timeout: 180000,
                shouldStop: () => stopRequested,
                onTechnique: (id, def) => {
                  socket.send(JSON.stringify({ type: "system", text: `Discussion style: ${def?.label || id} — ${def?.desc || ""}` }));
                },
                onTurnStart: (turn, question, tech) => {
                  socket.send(JSON.stringify({ type: "discuss-turn", turn }));
                  if (turn > 1) {
                    socket.send(JSON.stringify({ type: "moderator-msg", text: `Round ${turn} — following up:\n\n"${question}"` }));
                  }
                },
                onPanelistStart: (pid) => {
                  socket.send(JSON.stringify({ type: "provider-thinking", provider: pid }));
                },
                onResult: (r) => {
                  socket.send(JSON.stringify({ type: "provider-response", provider: r.provider, text: r.text, elapsed: r.elapsed, model: r.model }));
                  recordProviderRun({
                    requestId,
                    sessionId,
                    mode,
                    provider: r.provider,
                    model: config.models?.[r.provider],
                    status: r.error ? "error" : "ok",
                    latencyMs: (r.elapsed || 0) * 1000,
                    inputText: text,
                    outputText: r.text || "",
                    error: r.error ? r.text : null,
                  });
                },
                onSynthesis: (synthesisText, elapsed, turn) => {
                  socket.send(JSON.stringify({ type: "moderator-msg", text: `**Round ${turn} synthesis**\n\n${synthesisText}`, elapsed }));
                  recordProviderRun({
                    requestId,
                    sessionId,
                    mode,
                    provider: moderatorId,
                    model: moderatorModel,
                    latencyMs: (elapsed || 0) * 1000,
                    inputText: text,
                    outputText: synthesisText || "",
                  });
                },
                onConclude: (reason) => {
                  socket.send(JSON.stringify({ type: "system", text: `Moderator concluded the discussion (${reason}).` }));
                },
              }).then((result) => {
                const stoppedNote = stopRequested ? " (stopped by user)" : "";
                socket.send(JSON.stringify({ type: "moderator-msg", text: `**Discussion complete** — ${result.turns.length} round(s), ${result.totalTime}s, style: ${result.technique}${stoppedNote}.` }));
                try {
                  const session = new Session();
                  for (const t of result.turns) {
                    session.addTurn(t.question, [
                      ...t.results.map(r => ({ ...r, model: config.models?.[r.provider] || "auto" })),
                      { provider: moderatorId, text: `[synthesis] ${t.synthesis}`, elapsed: t.synthesisElapsed, model: moderatorModel || "auto" },
                    ]);
                  }
                } catch {}
                socket.send(JSON.stringify({ type: "done" }));
              }).catch(err => {
                socket.send(JSON.stringify({ type: "error", message: err.message }));
                socket.send(JSON.stringify({ type: "done" }));
              });
              break;
            }

            // Standard moderated query
            socket.send(JSON.stringify({ type: "thinking" }));
            const cfg = loadConfig() || defaultConfig();
            moderatedQuery(text, availableProviders, {
              models: cfg.models || {},
              cwd: sessionOptions.cwd,
              timeout: 180000,
              onRoute: (plan) => {
                for (const pid of plan.providers) {
                  socket.send(JSON.stringify({ type: "provider-thinking", provider: pid }));
                }
                if (plan.strategy !== "all") {
                  socket.send(JSON.stringify({ type: "system", text: `[${plan.intent}] ${plan.reason}` }));
                }
              },
              onChunk: (provider, delta) => {
                socket.send(JSON.stringify({ type: "provider-chunk", provider, delta }));
              },
              onResult: (r) => {
                socket.send(JSON.stringify({ type: "provider-response", provider: r.provider, text: r.text, elapsed: r.elapsed, model: r.model }));
                recordProviderRun({
                  requestId,
                  sessionId,
                  mode,
                  provider: r.provider,
                  model: cfg.models?.[r.provider],
                  status: r.error ? "error" : "ok",
                  latencyMs: (r.elapsed || 0) * 1000,
                  inputText: text,
                  outputText: r.text || "",
                  error: r.error ? r.text : null,
                });
              },
            }).then(({ results, skippedNote }) => {
              if (skippedNote) {
                socket.send(JSON.stringify({ type: "system", text: skippedNote }));
              }
              if (threadDir) {
                appendFileSync(join(threadDir, "messages.ndjson"),
                  JSON.stringify({ ts: Date.now(), role: "assistant", content: results.map(r => `[${r.provider}]\n${r.text}`).join("\n\n---\n\n"), providers: results }) + "\n");
              }
              try {
                const session = new Session();
                session.addTurn(text, results.map(r => ({ ...r, model: "auto" })));
              } catch {}
              socket.send(JSON.stringify({ type: "done" }));
            }).catch(err => {
              socket.send(JSON.stringify({ type: "error", message: err.message }));
              socket.send(JSON.stringify({ type: "done" }));
            });
            break;
          }

          // Single provider mode
          // Codex uses SDK fast path via runProvider — bypasses raw spawn for ~2x speedup on follow-ups
          if (provider === "codex") {
            socket.send(JSON.stringify({ type: "thinking" }));
            runProvider("codex", text, {
              model: sessionOptions.model,
              sessionId: sessionId, // reuse SDK thread per WS session
              cwd: sessionOptions.cwd,
              timeout: 180000,
            }).then((result) => {
              activeChild = null;
              socket.send(JSON.stringify({ type: "response", tools: [], text: result.text }));
              recordProviderRun({
                requestId,
                sessionId,
                mode,
                provider: "codex",
                model: sessionOptions.model,
                latencyMs: (result.elapsed || 0) * 1000,
                inputText: text,
                outputText: result.text || "",
              });
              if (threadDir && result.text) {
                appendFileSync(join(threadDir, "messages.ndjson"),
                  JSON.stringify({ ts: Date.now(), role: "assistant", content: result.text, tools: [] }) + "\n");
              }
              socket.send(JSON.stringify({ type: "done" }));
              console.log(`[codex] responded via SDK (${result.elapsed}s)`);
            }).catch(err => {
              activeChild = null;
              recordProviderRun({
                requestId,
                sessionId,
                mode,
                provider: "codex",
                model: sessionOptions.model,
                status: "error",
                inputText: text,
                error: err.message,
              });
              socket.send(JSON.stringify({ type: "error", message: err.message }));
              socket.send(JSON.stringify({ type: "done" }));
            });
            break;
          }

          // Build command based on provider
          const providerDef = PROVIDERS[provider] || PROVIDERS.kiro;
          let args, bin;

          if (provider === "kiro") {
            // Kiro has special resume logic
            args = ["chat", "--no-interactive", "--wrap", "never", "--trust-all-tools"];
            if (sessionOptions.model) args.push("--model", sessionOptions.model);
            if (sessionOptions.agent) args.push("--agent", sessionOptions.agent);
            if (kiroSessionId) args.push("--resume-id", kiroSessionId);
            args.push(text);
            bin = "kiro-cli";
          } else {
            args = providerDef.buildArgs(text, sessionOptions.model, { sessionId: providerSessions[provider], agent: sessionOptions.agent });
            bin = providerDef.bin;
          }

          socket.send(JSON.stringify({ type: "thinking" }));

          const startedAtMs = Date.now();
          const providerEnv = { ...process.env, ...(providerDef.env || {}) };
          // Load .env file if specified
          if (providerDef.envFile && existsSync(providerDef.envFile)) {
            const envContent = readFileSync(providerDef.envFile, "utf-8");
            for (const line of envContent.split("\n")) {
              const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.+?)["']?$/);
              if (m) providerEnv[m[1]] = m[2];
            }
          }
          const child = spawn(bin, args, {
            cwd: sessionOptions.cwd,
            env: providerEnv,
          });
          activeChild = child;

          let stdout = "";
          let stderr = "";
          let childErrored = false;
          child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
          child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

          child.on("error", (err) => {
            childErrored = true;
            activeChild = null;
            recordProviderRun({
              requestId,
              sessionId,
              mode,
              provider,
              model: sessionOptions.model,
              status: "error",
              latencyMs: Date.now() - startedAtMs,
              inputText: text,
              error: err.message,
            });
            socket.send(JSON.stringify({ type: "error", message: err.message }));
            socket.send(JSON.stringify({ type: "done" }));
          });

          child.on("close", (code) => {
            if (childErrored) return;
            activeChild = null;
            let responseTextForLog = "";

            // Provider-specific response handling
            if (provider === "kiro") {
              // Find kiro session ID
              if (!kiroSessionId) {
                kiroSessionId = findSessionForPrompt(text, startedAtMs);
                if (!kiroSessionId) {
                  const sessions = runKiroCmd(["chat", "--list-sessions"], sessionOptions.cwd);
                  const match = sessions.match(/SessionId:\s*([0-9a-f-]+)/);
                  if (match) kiroSessionId = match[1];
                }
                if (kiroSessionId && threadDir) {
                  const metaPath = join(threadDir, "meta.json");
                  const meta = readJsonFile(metaPath, {});
                  meta.kiroSessionId = kiroSessionId;
                  writeMeta(metaPath, meta);
                }
              }

              // Parse structured response from kiro session file
              let response = null;
              if (kiroSessionId) {
                response = parseLastTurn(kiroSessionId);
              }

              if (response) {
                socket.send(JSON.stringify({ type: "response", ...response }));
                responseTextForLog = response.text || "";
                if (threadDir) {
                  appendFileSync(join(threadDir, "messages.ndjson"),
                    JSON.stringify({ ts: Date.now(), role: "assistant", content: response.text, tools: response.tools }) + "\n");
                }
              } else {
                let fallback = stripAnsi(`${stdout}\n${stderr}`).replace(/^>\s*/gm, "").replace(/[▸►▶]\s*Time:\s*\S+/g, "").trim();
                fallback = fallback
                  .replace(/^All tools are now trusted.*$/gm, "")
                  .replace(/^Agents can sometimes.*$/gm, "")
                  .replace(/^Learn more at.*$/gm, "")
                  .replace(/\n{3,}/g, "\n\n")
                  .trim();
                socket.send(JSON.stringify({ type: "response", tools: [], text: fallback }));
                responseTextForLog = fallback;
                if (threadDir && fallback) {
                  appendFileSync(join(threadDir, "messages.ndjson"),
                    JSON.stringify({ ts: Date.now(), role: "assistant", content: fallback, tools: [] }) + "\n");
                }
              }
            } else {
              // Generic provider: just use stdout (strip ANSI + noise)
              const rawOut = stripAnsi(`${stdout}\n${stderr}`);
              let responseText = rawOut.trim();
              // Remove common CLI noise lines
              responseText = cleanProviderOutput(responseText);

              // Detect session ID for resume
              // (claude/copilot sessions are pre-set in runProviderAsync)

              socket.send(JSON.stringify({ type: "response", tools: [], text: responseText }));
              responseTextForLog = responseText;
              if (threadDir && responseText) {
                appendFileSync(join(threadDir, "messages.ndjson"),
                  JSON.stringify({ ts: Date.now(), role: "assistant", content: responseText, tools: [] }) + "\n");
              }
            }

            recordProviderRun({
              requestId,
              sessionId,
              mode,
              provider,
              model: sessionOptions.model,
              status: code === 0 ? "ok" : "error",
              latencyMs: Date.now() - startedAtMs,
              inputText: text,
              outputText: responseTextForLog,
              error: code === 0 ? null : `exit code ${code}`,
            });
            socket.send(JSON.stringify({ type: "done" }));
            console.log(`[${provider}] responded (code: ${code})`);
          });
          break;
        }
      }
    } catch (e) {
      console.error("[ws] error:", e.message);
    }
  });

  socket.on("close", () => {
    console.log("[ws] disconnected");
    if (activeChild) { activeChild.kill(); activeChild = null; }
  });
});

await app.listen({ port: PORT, host: HOST }).catch(async (err) => {
  if (err.code === "EADDRINUSE") {
    // Try next ports
    for (let p = PORT + 1; p < PORT + 10; p++) {
      try {
        await app.listen({ port: p, host: HOST });
        actualPort = p;
        console.log(`
\x1b[36m  ╦   ╦ ╦ ╔╗╔
  ║   ║ ║ ║║║
  ╩═╝ ╚═╝ ╝╚╝\x1b[0m

  \x1b[1mLun\x1b[0m web UI running
  \x1b[90mLocal:\x1b[0m   http://${HOST}:${p}
  \x1b[33mNote:\x1b[0m    port ${PORT} was busy, using ${p}
  \x1b[90mDocs:\x1b[0m    lun --help
  \x1b[90mCtrl+C\x1b[0m   to stop
`);
        return;
      } catch {}
    }
    console.error(`\x1b[31m  Error: ports ${PORT}-${PORT + 9} all in use\x1b[0m`);
    process.exit(1);
  }
  throw err;
});

console.log(`
\x1b[36m  ╦   ╦ ╦ ╔╗╔
  ║   ║ ║ ║║║
  ╩═╝ ╚═╝ ╝╚╝\x1b[0m

  \x1b[1mLun\x1b[0m ${IS_DAEMON ? "daemon dashboard" : "web UI"} running
  \x1b[90mLocal:\x1b[0m   http://${HOST}:${actualPort}
  \x1b[90mDocs:\x1b[0m    lun --help
  \x1b[90mCtrl+C\x1b[0m   to stop
`);

writeDaemonState({ pid: process.pid, host: HOST, port: actualPort, url: `http://${HOST}:${actualPort}`, daemon: IS_DAEMON });
appendDaemonLog(`${IS_DAEMON ? "daemon" : "server"} started`, { pid: process.pid, host: HOST, port: actualPort });
prewarmPersistentWorkers().catch(err => {
  appendDaemonLog("worker prewarm failed", { error: err.message });
});
startServeWatchdog();

process.on("SIGTERM", () => {
  shutdownClaudeWorkers();
  shutdownAcpWorkers();
  shutdownManagedAgentWorkers();
  shutdownCodexSDK();
  process.exit(0);
});

process.on("SIGINT", () => {
  shutdownClaudeWorkers();
  shutdownAcpWorkers();
  shutdownManagedAgentWorkers();
  shutdownCodexSDK();
  process.exit(0);
});
