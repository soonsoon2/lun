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
import { Session } from "./src/session.js";
import { loadConfig, defaultConfig, getSessionsDir } from "./src/config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.LUN_PORT || process.env.PORT || 3456);
const HOST = process.env.LUN_HOST || process.env.HOST || "127.0.0.1";
const DATA_DIR = join(__dirname, "_data");
const THREADS_DIR = join(DATA_DIR, "threads");
const KIRO_SESSIONS_DIR = join(process.env.HOME, ".kiro/sessions/cli");

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

        case "message": {
          if (activeChild) {
            socket.send(JSON.stringify({ type: "error", message: "이전 응답이 아직 진행 중입니다" }));
            break;
          }

          const text = msg.text;
          if (!text) break;

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

            // Chat mode — PM agent leads, delegates as needed
            if (msg.mode === "chat") {
              const config = loadConfig() || defaultConfig();
              const pmAgent = config.pmAgent || "claude";
              const pmModel = config.pmModel || config.models?.[pmAgent];

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
                timeout: 180000,
                onToolCall: (agent, prompt) => {
                  socket.send(JSON.stringify({ type: "system", text: `→ Calling ${agent}: ${prompt.slice(0, 60)}${prompt.length > 60 ? "..." : ""}` }));
                  socket.send(JSON.stringify({ type: "provider-thinking", provider: agent }));
                },
                onToolResult: (agent, result, elapsed) => {
                  socket.send(JSON.stringify({ type: "provider-response", provider: agent, text: result, elapsed }));
                },
              }).then((result) => {
                // PM's final synthesis
                socket.send(JSON.stringify({ type: "provider-response", provider: pmAgent, text: result.response, elapsed: result.elapsed }));
                chatHistory.push({ user: text, assistant: result.response });
                if (chatHistory.length > 10) chatHistory.shift();
                try {
                  const session = new Session();
                  session.addTurn(text, [{ provider: pmAgent, text: result.response, elapsed: result.elapsed, model: pmModel || "auto" }]);
                } catch {}
                socket.send(JSON.stringify({ type: "done" }));
              }).catch(err => {
                socket.send(JSON.stringify({ type: "error", message: err.message }));
                socket.send(JSON.stringify({ type: "done" }));
              });
              break;
            }

            // Discuss mode
            if (msg.discuss) {
              const config = loadConfig() || defaultConfig();
              // PM agent leads discussions too (use pmAgent if set, else moderator)
              const moderatorId = config.pmAgent || config.moderator || "claude";
              const moderatorModel = config.pmModel || config.models?.[moderatorId];
              const modName = PROVIDERS[moderatorId]?.name || moderatorId;

              // Moderator introduces the discussion
              socket.send(JSON.stringify({ type: "moderator-msg", text: `I'll moderate this discussion. Let me ask the panel for their perspectives.\n\nQuestion: "${text}"` }));

              discuss(text, availableProviders, {
                moderator: moderatorId,
                moderatorModel: moderatorModel,
                models: config.models || {},
                maxTurns: msg.maxTurns || config.autoDiscuss?.maxTurns || 3,
                maxTime: msg.maxTime || config.autoDiscuss?.maxTime || 120,
                timeout: 180000,
                onTurnStart: (turn, question) => {
                  if (turn > 1) {
                    socket.send(JSON.stringify({ type: "moderator-msg", text: `Let me follow up on the unresolved points:\n\n"${question}"` }));
                  }
                },
                onPanelistStart: (pid) => {
                  socket.send(JSON.stringify({ type: "provider-thinking", provider: pid }));
                },
                onResult: (r) => {
                  socket.send(JSON.stringify({ type: "provider-response", provider: r.provider, text: r.text, elapsed: r.elapsed }));
                },
                onSynthesis: (text, elapsed) => {
                  socket.send(JSON.stringify({ type: "moderator-msg", text: `**Synthesis:**\n\n${text}`, elapsed }));
                },
                onFollowup: () => {},
              }).then((result) => {
                socket.send(JSON.stringify({ type: "moderator-msg", text: `**Discussion complete** — ${result.turns.length} round(s), ${result.totalTime}s total.` }));
                try {
                  const session = new Session();
                  for (const t of result.turns) {
                    session.addTurn(t.question, t.results.map(r => ({ ...r, model: "auto" })));
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
            moderatedQuery(text, availableProviders, {
              models: {},
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
                socket.send(JSON.stringify({ type: "provider-response", provider: r.provider, text: r.text, elapsed: r.elapsed }));
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
            socket.send(JSON.stringify({ type: "error", message: err.message }));
            socket.send(JSON.stringify({ type: "done" }));
          });

          child.on("close", (code) => {
            if (childErrored) return;
            activeChild = null;

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
              if (threadDir && responseText) {
                appendFileSync(join(threadDir, "messages.ndjson"),
                  JSON.stringify({ ts: Date.now(), role: "assistant", content: responseText, tools: [] }) + "\n");
              }
            }

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

  \x1b[1mLun\x1b[0m web UI running
  \x1b[90mLocal:\x1b[0m   http://${HOST}:${PORT}
  \x1b[90mDocs:\x1b[0m    lun --help
  \x1b[90mCtrl+C\x1b[0m   to stop
`);
