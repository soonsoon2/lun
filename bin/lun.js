#!/usr/bin/env node
/**
 * 論 (Lun) — Multi-agent consensus CLI.
 * Entry point for `lun` command.
 */
import { PROVIDERS, checkAvailable, getAvailableProviders } from "../src/providers.js";
import { runProvider, runAll } from "../src/runner.js";
import { moderatedQuery, detectIntent, discuss, synthesize } from "../src/moderator.js";
import { chatTurn } from "../src/lun-agent.js";
import { SKILLS, AGENT_SKILLS, agentsBySkill } from "../src/skills.js";
import { loadConfig, saveConfig, defaultConfig, ensureDirs, CONFIG_PATH, getSessionsDir, migrateSessions, DEFAULT_WORK_DIR, ensureWorkDir, getWorkDir } from "../src/config.js";
import { Session, listSessions } from "../src/session.js";
import { DAEMON_LOG_PATH, readDaemonState } from "../src/daemon-store.js";
import { t } from "../src/i18n.js";
import { printBanner, selectFromList, promptText, Progress, VERSION } from "../src/ui.js";
import { createInterface } from "readline";
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync, closeSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================
// ARGS
// ============================================================
const args = process.argv.slice(2);
let cliProviders = null;
let cliModels = {};
let summarize = false;
let discussMode = false;
let maxTurns = 3;
let maxTime = 120;
let jsonOutput = false;
let timeout = null;
let cliSessionId = null;
let daemonMode = null;
let promptParts = [];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--init") { await cmdInit(); process.exit(0); }
  if (a === "--config") { cmdConfig(); process.exit(0); }
  if (a === "--setup-rules") { await cmdSetupRules(); process.exit(0); }
  if (a === "serve") { await cmdServe(); process.exit(0); }
  if (a === "daemon") { await cmdDaemon(args[i + 1]); process.exit(0); }
  if (a === "dashboard") { await cmdDaemon("foreground"); process.exit(0); }
  if (a === "chat") { await cmdChat(); process.exit(0); }
  if (a === "--skills") { cmdSkills(); process.exit(0); }
  if (a === "--move-sessions") { await cmdMoveSessions(); process.exit(0); }
  if (a === "--providers" || a === "-P") { cliProviders = args[++i]?.split(",").map(s => s.trim()).filter(Boolean); }
  else if (a === "--models" || a === "-M") {
    for (const pair of (args[++i] || "").split(",")) { const [p, m] = pair.split(":"); if (p && m) cliModels[p.trim()] = m.trim(); }
  }
  else if (a === "--summarize" || a === "-s") { summarize = true; }
  else if (a === "--discuss" || a === "-d") { discussMode = true; }
  else if (a === "--max-turns") { maxTurns = parseInt(args[++i]) || 3; }
  else if (a === "--max-time") { maxTime = parseInt(args[++i]) || 120; }
  else if (a === "--json" || a === "-j") { jsonOutput = true; }
  else if (a === "--timeout" || a === "-t") { timeout = parseInt(args[++i]) * 1000 || null; }
  else if (a === "--session") { cliSessionId = args[++i] || null; }
  else if (a === "--chat") { daemonMode = "chat"; }
  else if (a === "--ask") { daemonMode = "ask"; }
  else if (a === "--sessions" || a === "-H") { cmdSessions(); process.exit(0); }
  else if (a === "--help" || a === "-h") { cmdHelp(); process.exit(0); }
  else if (a === "--list" || a === "-l") { cmdList(); process.exit(0); }
  else if (a === "--version" || a === "-v") { console.log(`lun v${VERSION}`); process.exit(0); }
  else { promptParts.push(a); }
}

// ============================================================
// COMMANDS
// ============================================================
async function cmdInit() {
  printBanner();
  console.log(`  \x1b[1m${t("init_title")}\x1b[0m\n`);

  const lang = await selectFromList("  Language / 언어 / 言語:", [
    { label: "English", value: "en" },
    { label: "한국어", value: "ko" },
    { label: "日本語", value: "ja" },
  ]);

  // Save lang immediately so t() works
  saveConfig({ ...(loadConfig() || defaultConfig()), language: lang });

  const available = Object.entries(PROVIDERS)
    .filter(([id]) => checkAvailable(id))
    .map(([id, def]) => ({ label: `${def.name} (${id})`, value: id, checked: true }));

  const unavailable = Object.entries(PROVIDERS).filter(([id]) => !checkAvailable(id));
  if (unavailable.length > 0) {
    console.log(`\n  \x1b[90m${t("not_installed")}: ${unavailable.map(([, d]) => d.name).join(", ")}\x1b[0m`);
  }
  if (available.length === 0) {
    console.log(`\n  \x1b[31m${t("no_providers")}\x1b[0m`);
    printInstallHelp();
    process.exit(1);
  }

  console.log("");
  const providers = await selectFromList(`  ${t("provider_select")}`, available, true);

  const models = {};
  for (const pid of providers) {
    const def = PROVIDERS[pid];
    const modelList = def.getModels();
    if (modelList.length > 0) {
      console.log("");
      const sel = await selectFromList(`  ${t("model_select", def.name)}`, modelList.map(m => ({ label: m.label, value: m.id })));
      if (sel === "__custom__") {
        const custom = await promptText(`  ${def.name} model name`, def.defaultModel || "auto");
        models[pid] = custom;
      } else {
        models[pid] = sel;
      }
    }
  }

  // PM Agent selection (acts as both chat host and discussion moderator)
  console.log("");
  const pmItems = providers.map(pid => ({
    label: `${PROVIDERS[pid]?.name || pid}${pid === "claude" ? " (recommended — fast, light)" : pid === "codex" ? " (slow, heavy context)" : ""}`,
    value: pid,
  }));
  const pmChoice = await selectFromList("  PM Agent (chat host & discussion moderator):", pmItems);
  // Moderator = PM (same agent serves both roles)
  const moderatorChoice = pmChoice;

  // PM-specific model (separate from main task model)
  const pmDef = PROVIDERS[pmChoice];
  const pmModelList = pmDef.getModels();
  let pmModel = models[pmChoice];
  if (pmModelList.length > 0) {
    console.log("");
    const fastNotes = {
      claude: "haiku (fast, recommended)",
      agy: "auto (Antigravity default)",
      copilot: "claude-haiku-4.5 (fast)",
    };
    const note = fastNotes[pmChoice] ? ` — Tip: ${fastNotes[pmChoice]} for routing` : "";
    const pmModelChoice = await selectFromList(`  PM model${note}:`, pmModelList.map(m => ({ label: m.label, value: m.id })));
    if (pmModelChoice === "__custom__") {
      pmModel = await promptText(`  ${pmDef.name} PM model name`, pmDef.defaultModel || "auto");
    } else {
      pmModel = pmModelChoice;
    }
  }

  console.log("");
  const timeoutStr = await promptText(t("timeout_prompt"), "120");

  console.log("");
  console.log(`  \x1b[90mLun runs agents in a dedicated work folder (keeps kiro/codex fast).\x1b[0m`);
  const workDirInput = await promptText("  Work folder", DEFAULT_WORK_DIR);
  const workDir = workDirInput.startsWith("~/") ? join(process.env.HOME, workDirInput.slice(2)) : (workDirInput || DEFAULT_WORK_DIR);
  ensureWorkDir(workDir);

  const config = { language: lang, providers, models, timeout: parseInt(timeoutStr) || 120, workDir, moderator: moderatorChoice, pmAgent: pmChoice, pmModel, sessionsPath: getSessionsDir(), autoDiscuss: { enabled: false, maxTurns: 3, maxTime: 120 } };
  saveConfig(config);
  console.log(`\n  \x1b[32mv\x1b[0m ${t("config_saved")} ${CONFIG_PATH}\n`);
}

function cmdConfig() {
  const config = loadConfig();
  if (!config) { console.log(`\n  \x1b[33m${t("no_providers")}\x1b[0m\n`); return; }
  printBanner();
  console.log(`  \x1b[1m${t("config_title")}\x1b[0m\n`);
  console.log(`  File:      ${CONFIG_PATH}`);
  console.log(`  Language:  ${config.language}`);
  console.log(`  Providers: ${config.providers.join(", ")}`);
  console.log(`  Models:`);
  for (const [pid, model] of Object.entries(config.models || {})) console.log(`    ${pid}: ${model}`);
  if (config.pmAgent) console.log(`  PM Agent:  ${config.pmAgent} (${config.pmModel || config.models?.[config.pmAgent] || "default"})`);
  if (config.moderator) console.log(`  Moderator: ${config.moderator}`);
  console.log(`  Timeout:   ${config.timeout}s`);
  console.log(`  Work dir:  ${config.workDir || DEFAULT_WORK_DIR}`);
  console.log(`  Sessions:  ${getSessionsDir()}\n`);
}

function cmdList() {
  printBanner();
  for (const [id, def] of Object.entries(PROVIDERS)) {
    const avail = checkAvailable(id);
    const icon = avail ? "\x1b[32mv\x1b[0m" : "\x1b[31mx\x1b[0m";
    console.log(`  ${icon}  ${id.padEnd(10)} ${def.name.padEnd(16)} model: ${def.defaultModel}`);
  }
  const missing = Object.keys(PROVIDERS).filter(id => !checkAvailable(id));
  if (missing.length > 0) printInstallHelp();
  console.log("");
}

function cmdSessions() {
  const sessions = listSessions(10);
  if (!sessions.length) { console.log(`\n  ${t("history_empty")}\n`); return; }
  console.log(`\n  \x1b[1m${t("history_title")}:\x1b[0m\n`);
  for (const s of sessions) {
    const date = s.date?.slice(0, 16).replace("T", " ") || "?";
    console.log(`  \x1b[90m${date}\x1b[0m  [${s.turns} turns]  ${s.firstPrompt}...`);
  }
  console.log(`\n  \x1b[90mPath: ${getSessionsDir()}\x1b[0m\n`);
}

function cmdSkills() {
  printBanner();
  const available = Object.keys(PROVIDERS).filter(checkAvailable);
  console.log(`  \x1b[1mSkill Matrix\x1b[0m\n`);

  const colorize = (level) => {
    const map = {
      expert: "\x1b[32mexpert\x1b[0m",
      native: "\x1b[36mnative\x1b[0m",
      common: "\x1b[90mcommon\x1b[0m",
      none: "\x1b[31mx\x1b[0m",
    };
    return map[level] || level;
  };

  // Header
  const colWidth = 14;
  let header = "  " + "skill".padEnd(20);
  for (const a of available) header += a.padEnd(colWidth);
  console.log(header);
  console.log("  " + "-".repeat(20 + colWidth * available.length));

  for (const [skillId, def] of Object.entries(SKILLS)) {
    let row = "  " + skillId.padEnd(20);
    for (const a of available) {
      const level = AGENT_SKILLS[a]?.[skillId] || "none";
      const colored = colorize(level);
      // Account for ANSI codes when padding
      const visibleLen = level.length;
      row += colored + " ".repeat(Math.max(0, colWidth - visibleLen));
    }
    console.log(row);
  }
  console.log(`\n  \x1b[1mLegend:\x1b[0m \x1b[32mexpert\x1b[0m = top-tier · \x1b[36mnative\x1b[0m = built-in tool · \x1b[90mcommon\x1b[0m = capable · \x1b[31mx\x1b[0m = unavailable`);
  console.log(`\n  PM auto-routes by skill. e.g., 'lun "search latest news"' → uses native search agents only.\n`);
}

function cmdHelp() {
  printBanner();
  console.log(`  \x1b[1mUsage:\x1b[0m
    lun                        Interactive mode (REPL)
    lun chat                   Lun Agent — PM-style conversation
    lun "prompt"               One-shot query to all agents
    lun serve                  Start web UI
    lun daemon                 Start daemon dashboard in foreground
    lun daemon start           Start daemon in background
    lun daemon stop            Stop background daemon
    lun daemon status          Show daemon status

  \x1b[1mOptions:\x1b[0m
    -P, --providers <list>     Providers (comma-separated)
    -M, --models <list>        Models (provider:model,...)
    -s, --summarize            Add synthesis of all answers
    -d, --discuss              Autonomous discussion mode
    --max-turns <n>            Max rounds in discuss mode (default: 3)
    --max-time <sec>           Max time for discussion (default: 120)
    --session <id>             Reuse a daemon API session id
    --chat                     Use daemon PM chat mode for a one-shot prompt
    --ask                      Use daemon multi-agent ask mode
    -j, --json                 JSON output (for agent integration)
    -t, --timeout <sec>        Timeout (default: 120)
    -l, --list                 List available providers
    --skills                   Show skill matrix per agent
    -H, --sessions             View saved sessions
    -v, --version              Version
    -h, --help                 This help

  \x1b[1mSetup:\x1b[0m
    lun --init                 First-time configuration
    lun --config               View current config
    lun --setup-rules          Install lun rules into current project
    lun --move-sessions        Change sessions storage path
    lun serve                  Start web UI (default: localhost:3456)
    lun daemon                 Start daemon dashboard (default: localhost:3456)
    lun daemon start|stop|status

  \x1b[1mExamples:\x1b[0m
    lun "REST vs GraphQL?"
    lun -M claude:opus "deep analysis"
    lun -j "machine-readable query"
    lun -P kiro,claude -s "summarize too"
`);
}

function printInstallHelp() {
  console.log(`\n  \x1b[90m${t("install_help")}\x1b[0m`);
  for (const id of Object.keys(PROVIDERS).filter(id => !checkAvailable(id))) {
    const def = PROVIDERS[id];
    console.log(`    ${id.padEnd(8)} ${def.installHint || def.bin}`);
  }
}

// ============================================================
// MOVE SESSIONS — change storage path
// ============================================================
async function cmdMoveSessions() {
  const config = loadConfig() || defaultConfig();
  const currentPath = getSessionsDir();

  console.log(`\n  \x1b[1mMove sessions storage\x1b[0m\n`);
  console.log(`  Current path: ${currentPath}\n`);

  const newPath = await promptText("  New path", "");
  if (!newPath) { console.log("  \x1b[90mCancelled.\x1b[0m\n"); return; }

  // Expand ~
  const resolved = newPath.startsWith("~/") ? join(process.env.HOME, newPath.slice(2)) : newPath;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve => {
    rl.question(`  Migrate existing sessions to new path? (y/n) `, resolve);
  });
  rl.close();

  if (answer.trim().toLowerCase() === "y") {
    const count = migrateSessions(currentPath, resolved);
    console.log(`  \x1b[32mv\x1b[0m Migrated ${count} files to ${resolved}`);
  } else {
    mkdirSync(resolved, { recursive: true });
    console.log(`  \x1b[90mStarting fresh at ${resolved}\x1b[0m`);
  }

  config.sessionsPath = resolved;
  saveConfig(config);
  console.log(`  \x1b[32mv\x1b[0m Config updated. Sessions now at: ${resolved}\n`);
}

// ============================================================
// CHAT — Lun Agent (PM-style conversational agent)
// ============================================================
async function cmdChat() {
  const config = loadConfig() || defaultConfig();
  const pmAgent = config.pmAgent || config.moderator || "claude";
  // pmModel takes precedence over models[pmAgent] — PM uses its own model
  const pmModel = config.pmModel || config.models?.[pmAgent];
  const availableAgents = Object.keys(PROVIDERS).filter(checkAvailable);

  if (!checkAvailable(pmAgent)) {
    console.error(`\n  \x1b[31mPM agent "${pmAgent}" is not installed.\x1b[0m\n`);
    console.error(`  Run \`lun --init\` to configure.\n`);
    process.exit(1);
  }

  printBanner();
  console.log(`  \x1b[1mLun Chat\x1b[0m — PM: ${PROVIDERS[pmAgent]?.name || pmAgent} (${pmModel || "default"})`);
  console.log(`  \x1b[90mAvailable specialists: ${availableAgents.filter(a => a !== pmAgent).join(", ")}\x1b[0m`);
  console.log(`  \x1b[90mType your message. /quit to exit, /save to end session.\x1b[0m\n`);

  const session = new Session();
  const history = [];
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = () => new Promise(r => {
    let resolved = false;
    const onClose = () => { if (!resolved) { resolved = true; r(null); } };
    rl.on("close", onClose);
    try {
      rl.question("\x1b[36m  > \x1b[0m", (ans) => {
        if (resolved) return;
        resolved = true;
        rl.removeListener("close", onClose);
        r(ans);
      });
    } catch (e) {
      if (!resolved) { resolved = true; r(null); }
    }
  });

  while (true) {
    const input = await ask();
    if (input === null) break;
    const t = input.trim();
    if (!t) continue;
    if (t === "/quit" || t === "/exit") {
      console.log(`\n  \x1b[32mv\x1b[0m Session saved: ${session.filePath}\n`);
      break;
    }
    if (t === "/save") {
      console.log(`\n  \x1b[32mv\x1b[0m Saved: ${session.filePath}\n`);
      continue;
    }

    try {
      const result = await chatTurn({
        pmAgent,
        pmModel,
        availableAgents,
        history,
        userMessage: t,
        models: config.models || {},
        cwd: process.cwd(),
        timeout: (config.timeout || 120) * 1000,
        onPMThinking: (round) => {
          if (round === 0) console.log(`  \x1b[90m${PROVIDERS[pmAgent]?.name || pmAgent} thinking...\x1b[0m`);
          else console.log(`  \x1b[90mProcessing tool results (round ${round + 1})...\x1b[0m`);
        },
        onToolCall: (agent, prompt) => {
          const short = prompt.length > 60 ? prompt.slice(0, 60) + "..." : prompt;
          console.log(`  \x1b[33m→ Calling ${agent}:\x1b[0m \x1b[90m${short}\x1b[0m`);
        },
        onToolResult: (agent, text, elapsed) => {
          const short = text.length > 100 ? text.slice(0, 100) + "..." : text;
          console.log(`  \x1b[32m← ${agent} (${elapsed}s):\x1b[0m \x1b[90m${short}\x1b[0m`);
        },
      });

      const totalTime = result.elapsed + result.toolCalls.reduce((sum, t) => sum + (t.elapsed || 0), 0);
      const toolCount = result.toolCalls.length;
      const stats = toolCount > 0
        ? `\x1b[90m[${pmAgent} ${result.elapsed}s + ${toolCount} tool(s) = ${totalTime.toFixed(1)}s total]\x1b[0m`
        : `\x1b[90m[${pmAgent} ${result.elapsed}s]\x1b[0m`;
      console.log(`\n  \x1b[36m${result.response.replace(/\n/g, "\n  ")}\x1b[0m`);
      console.log(`  ${stats}\n`);
      history.push({ user: t, assistant: result.response });
      session.addTurn(t, [{ provider: pmAgent, text: result.response, elapsed: result.elapsed, model: pmModel || "auto" }]);
    } catch (err) {
      console.log(`  \x1b[31mError: ${err.message}\x1b[0m\n`);
    }
  }

  rl.close();
}

// ============================================================
// SERVE — start web UI
// ============================================================
async function cmdServe() {
  const port = process.env.LUN_PORT || process.env.PORT || 3456;
  const serverPath = join(__dirname, "..", "server.js");
  const { spawn: spawnChild } = await import("child_process");

  console.log(`\n  \x1b[90mStarting Lun web UI on port ${port}...\x1b[0m\n`);

  const child = spawnChild("node", [serverPath], {
    stdio: "inherit",
    // LUN_DAEMON=1 makes serve a live Lun environment: workers are prewarmed
    // and stay warm for as long as the web UI process is running.
    // LUN_SERVE=1 enables browser-lifecycle shutdown (close tab => exit).
    env: { ...process.env, LUN_PORT: String(port), LUN_DAEMON: "1", LUN_SERVE: "1" },
  });

  child.on("error", (err) => {
    console.error(`  \x1b[31mFailed to start server:\x1b[0m ${err.message}`);
    process.exit(1);
  });

  await new Promise(() => {});
}

async function pingDaemon(url) {
  try {
    const r = await fetch(`${url}/api/daemon`, { signal: AbortSignal.timeout(1000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function waitForDaemon(url, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pingDaemon(url)) return true;
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

function getDaemonUrl() {
  if (process.env.LUN_DAEMON_URL) return process.env.LUN_DAEMON_URL.replace(/\/$/, "");
  const state = readDaemonState();
  return state?.url || null;
}

async function queryDaemon(payload) {
  const url = getDaemonUrl();
  if (!url) return null;
  try {
    const r = await fetch(`${url}/api/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(payload.timeoutMs || 180000),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function queryDaemonStream(payload, onEvent) {
  const url = getDaemonUrl();
  if (!url) return null;
  try {
    const r = await fetch(`${url}/api/query/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(payload.timeoutMs || 180000),
    });
    if (!r.ok || !r.body) return null;

    const decoder = new TextDecoder();
    let buffer = "";
    let finalResult = null;

    const handleBlock = (block) => {
      let event = "message";
      const dataLines = [];
      for (const line of block.split(/\r?\n/)) {
        if (!line || line.startsWith(":")) continue;
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      if (!dataLines.length) return;
      let data;
      try {
        data = JSON.parse(dataLines.join("\n"));
      } catch {
        data = { raw: dataLines.join("\n") };
      }
      if (event === "done") finalResult = data;
      if (onEvent) onEvent(event, data);
    };

    for await (const chunk of r.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        handleBlock(block);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) handleBlock(buffer);
    return finalResult;
  } catch {
    return null;
  }
}

function printDaemonResults(result, activeModels, asJson, options = {}) {
  if (asJson) {
    console.log(JSON.stringify({
      event: "start",
      intent: result.intent || result.mode,
      strategy: result.strategy || "daemon",
      providers: (result.results || []).map(r => r.provider),
      daemon: true,
      timestamp: new Date().toISOString(),
    }));
    for (const r of result.results || []) {
      console.log(JSON.stringify({ event: "result", provider: r.provider, model: r.model || activeModels[r.provider] || "auto", text: r.text, elapsed: r.elapsed, error: !!r.error }));
    }
    console.log(JSON.stringify({ event: "done", total: (result.results || []).length, errors: (result.results || []).filter(r => r.error).length, skippedNote: result.skippedNote || null, daemon: true }));
    return;
  }

  if (!options.skipHeader) {
    console.log(`\n\x1b[90m  Lun daemon — ${result.intent || result.mode || "query"}\x1b[0m\n`);
  } else {
    console.log("");
  }
  for (const r of result.results || []) {
    const name = PROVIDERS[r.provider]?.name || r.provider;
    const model = r.model || activeModels[r.provider] || "auto";
    console.log(`\x1b[36m  --- ${name} (${r.elapsed || 0}s, ${model}) ---\x1b[0m`);
    console.log(`  ${(r.text || "(no response)").replace(/\n/g, "\n  ")}\n`);
  }
  if (result.skippedNote) console.log(`  \x1b[90m${result.skippedNote}\x1b[0m\n`);
  console.log(`\x1b[90m  ────────────────────────────────────────────────────────\x1b[0m\n`);
}

async function cmdDaemon(action = "foreground") {
  const port = process.env.LUN_PORT || process.env.PORT || 3456;
  const serverPath = join(__dirname, "..", "server.js");
  const { spawn: spawnChild } = await import("child_process");

  const state = readDaemonState();
  const requestedUrl = `http://127.0.0.1:${port}`;
  const daemonUrl = state?.url || `http://127.0.0.1:${port}`;

  if (action === "status") {
    const alive = await pingDaemon(daemonUrl);
    if (alive) {
      console.log(`\n  \x1b[32mv\x1b[0m Lun daemon running`);
      console.log(`  URL: ${daemonUrl}`);
      console.log(`  PID: ${state?.pid || "?"}\n`);
    } else {
      console.log(`\n  \x1b[90mLun daemon is not running.\x1b[0m\n`);
    }
    return;
  }

  if (action === "stop") {
    if (!state?.pid) {
      console.log(`\n  \x1b[90mNo daemon pid found.\x1b[0m\n`);
      return;
    }
    try {
      process.kill(state.pid, "SIGTERM");
      console.log(`\n  \x1b[32mv\x1b[0m Stopped Lun daemon (${state.pid})\n`);
    } catch (err) {
      console.log(`\n  \x1b[31mx\x1b[0m Failed to stop daemon: ${err.message}\n`);
    }
    return;
  }

  if (action === "start") {
    if (await pingDaemon(requestedUrl)) {
      console.log(`\n  \x1b[32mv\x1b[0m Lun daemon already running`);
      console.log(`  URL: ${requestedUrl}\n`);
      return;
    }

    mkdirSync(dirname(DAEMON_LOG_PATH), { recursive: true });
    const out = openSync(DAEMON_LOG_PATH, "a");
    const err = openSync(DAEMON_LOG_PATH, "a");
    const child = spawnChild("node", [serverPath], {
      detached: true,
      stdio: ["ignore", out, err],
      env: { ...process.env, LUN_PORT: String(port), LUN_DAEMON: "1" },
    });
    child.unref();
    closeSync(out);
    closeSync(err);

    const started = await waitForDaemon(requestedUrl, 5000);
    if (started) {
      console.log(`\n  \x1b[32mv\x1b[0m Lun daemon started`);
      console.log(`  URL: ${requestedUrl}`);
      console.log(`  Log: ${DAEMON_LOG_PATH}\n`);
    } else {
      console.log(`\n  \x1b[33m!\x1b[0m Daemon process launched, but health check did not respond yet.`);
      console.log(`  Log: ${DAEMON_LOG_PATH}\n`);
    }
    return;
  }

  console.log(`\n  \x1b[90mStarting Lun daemon dashboard on port ${port}...\x1b[0m\n`);

  const child = spawnChild("node", [serverPath], {
    stdio: "inherit",
    env: { ...process.env, LUN_PORT: String(port), LUN_DAEMON: "1" },
  });

  child.on("error", (err) => {
    console.error(`  \x1b[31mFailed to start daemon:\x1b[0m ${err.message}`);
    process.exit(1);
  });

  await new Promise(() => {});
}

// ============================================================
// SETUP RULES — install lun rule files into current project
// ============================================================
async function cmdSetupRules() {
  printBanner();
  console.log(`  \x1b[1mSetup agent rules for this project\x1b[0m\n`);
  console.log(`  This will add lun consultation rules so your AI agents`);
  console.log(`  know how to use lun for multi-agent opinions.\n`);

  const cwd = process.cwd();
  const rulesDir = join(__dirname, "..", "rules");

  const targets = [
    { id: "claude", file: "claude.md", dest: "CLAUDE.md", append: true, desc: "Claude Code (CLAUDE.md)" },
    { id: "kiro", file: "kiro.md", dest: ".kiro/steering/lun.md", append: false, desc: "Kiro (.kiro/steering/lun.md)" },
    { id: "copilot", file: "copilot.md", dest: ".github/copilot-instructions.md", append: true, desc: "Copilot (.github/copilot-instructions.md)" },
    { id: "agy", file: "agy.md", dest: ".antigravity/AGENTS.md", append: true, desc: "Antigravity (.antigravity/AGENTS.md)" },
    { id: "codex", file: "codex.md", dest: "AGENTS.md", append: true, desc: "Codex / OpenAI (AGENTS.md)" },
  ];

  for (const target of targets) {
    const destPath = join(cwd, target.dest);
    const srcPath = join(rulesDir, target.file);
    const exists = existsSync(destPath);

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => {
      const action = exists && target.append ? "append to" : "create";
      rl.question(`  ${action} ${target.desc}? (y/n) `, resolve);
    });
    rl.close();

    if (answer.trim().toLowerCase() === "y") {
      const content = readFileSync(srcPath, "utf-8");
      const dir = join(cwd, target.dest.split("/").slice(0, -1).join("/"));
      if (dir && dir !== cwd) mkdirSync(dir, { recursive: true });

      if (exists && target.append) {
        const existing = readFileSync(destPath, "utf-8");
        if (!existing.includes("lun")) {
          writeFileSync(destPath, existing + "\n\n" + content);
          console.log(`    \x1b[32mv\x1b[0m Appended to ${target.dest}`);
        } else {
          console.log(`    \x1b[90m- Already contains lun rules, skipped\x1b[0m`);
        }
      } else {
        mkdirSync(join(cwd, target.dest.split("/").slice(0, -1).join("/")), { recursive: true });
        writeFileSync(destPath, content);
        console.log(`    \x1b[32mv\x1b[0m Created ${target.dest}`);
      }
    } else {
      console.log(`    \x1b[90m- Skipped\x1b[0m`);
    }
  }

  console.log(`\n  \x1b[32mDone.\x1b[0m Your agents can now use lun for consultations.\n`);
}

// ============================================================
// INTERACTIVE MODE (REPL)
// ============================================================
async function interactiveMode(activeProviders, activeModels, activeTimeout) {
  printBanner();
  console.log(`  \x1b[90m${t("interactive_hint")}\x1b[0m\n`);

  const session = new Session();
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const ask = () => new Promise((resolve) => {
    rl.question("\x1b[36m  > \x1b[0m", (answer) => resolve(answer));
  });

  while (true) {
    const input = await ask();
    const trimmed = input.trim();

    if (!trimmed) continue;
    if (trimmed === "/save" || trimmed === "/quit" || trimmed === "/exit") {
      console.log(`\n  \x1b[32mv\x1b[0m ${t("session_saved", session.filePath)}\n`);
      break;
    }

    // Run moderated query
    const { intent, reason, skippedNote, results } = await moderatedQuery(trimmed, activeProviders, {
      models: activeModels,
      cwd: process.cwd(),
      timeout: activeTimeout,
      onRoute: (plan) => {
        if (plan.strategy !== "all") {
          console.log(`\n  \x1b[90m[${plan.intent}] ${plan.reason}\x1b[0m`);
        }
        console.log("");
        // Show progress
        for (const pid of plan.providers) {
          console.log(`  \x1b[33m~ ${(PROVIDERS[pid]?.name || pid).padEnd(14)} ${t("responding")}\x1b[0m`);
        }
        console.log("");
      },
      onResult: (r) => {
        const name = PROVIDERS[r.provider]?.name || r.provider;
        const model = activeModels[r.provider] || "auto";
        console.log(`\x1b[36m  --- ${name} (${r.elapsed}s, ${model}) ---\x1b[0m`);
        console.log(`  ${(r.text || "(no response)").replace(/\n/g, "\n  ")}\n`);
      },
    });

    if (skippedNote) console.log(`  \x1b[90m${skippedNote}\x1b[0m\n`);

    // Save turn
    session.addTurn(trimmed, results.map(r => ({ ...r, model: activeModels[r.provider] || "auto" })));
  }

  rl.close();
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const config = loadConfig() || defaultConfig();
  const requestedProviders = cliProviders || config.providers || Object.keys(PROVIDERS);
  const activeProviders = requestedProviders.filter(checkAvailable);
  const skipped = requestedProviders.filter(id => !checkAvailable(id));
  const activeModels = { ...config.models, ...cliModels };
  const activeTimeout = timeout || (config.timeout * 1000) || 120000;

  // Read stdin if piped
  let stdinData = "";
  if (!process.stdin.isTTY) {
    stdinData = await new Promise((resolve) => {
      let d = ""; process.stdin.setEncoding("utf-8");
      process.stdin.on("data", c => { d += c; });
      process.stdin.on("end", () => resolve(d.trim()));
      setTimeout(() => { process.stdin.destroy(); resolve(d.trim()); }, 1000);
    });
  }

  const promptText = promptParts.join(" ");
  let fullPrompt = stdinData && promptText ? `${promptText}\n\n---\n\n${stdinData}` : stdinData || promptText;

  // No prompt → interactive mode
  if (!fullPrompt) {
    if (!activeProviders.length) { console.error(`\n  \x1b[31mx\x1b[0m ${t("no_providers")}\n`); process.exit(1); }
    await interactiveMode(activeProviders, activeModels, activeTimeout);
    process.exit(0);
  }

  if (!activeProviders.length) { console.error(`\n  \x1b[31mx\x1b[0m ${t("no_providers")}\n`); process.exit(1); }

  if (skipped.length > 0 && !jsonOutput) {
    console.log(`  \x1b[90m${t("skipped", skipped.join(", "))}\x1b[0m`);
  }

  if (!process.env.LUN_NO_DAEMON && !discussMode && !summarize) {
    const daemonPayload = {
      text: fullPrompt,
      mode: daemonMode || (cliProviders ? "ask" : "chat"),
      agents: activeProviders,
      sessionId: cliSessionId || undefined,
      timeoutMs: activeTimeout,
      cwd: process.cwd(),
    };
    let printedProgressHeader = false;
    const daemonResult = jsonOutput
      ? await queryDaemon(daemonPayload)
      : await queryDaemonStream(daemonPayload, (event, data) => {
        if (event === "progress") {
          if (!printedProgressHeader) {
            console.log(`\n\x1b[90m  Lun daemon — ${daemonPayload.mode}\x1b[0m\n`);
            printedProgressHeader = true;
          }
          const provider = data.provider ? `${data.provider}: ` : "";
          const elapsed = typeof data.elapsed === "number" ? ` \x1b[90m${data.elapsed}s\x1b[0m` : "";
          console.log(`  \x1b[33m~\x1b[0m ${provider}${data.message || data.stage || "working"}${elapsed}`);
          if (data.preview) {
            const preview = String(data.preview).replace(/\s+/g, " ").slice(0, 160);
            if (preview) console.log(`    \x1b[90m${preview}\x1b[0m`);
          }
        } else if (event === "error") {
          console.log(`  \x1b[31mx\x1b[0m ${data.error || "daemon error"}`);
        }
      }) || await queryDaemon(daemonPayload);
    if (daemonResult?.ok) {
      printDaemonResults(daemonResult, activeModels, jsonOutput, { skipHeader: printedProgressHeader });
      const session = new Session();
      session.addTurn(fullPrompt, (daemonResult.results || []).map(r => ({ ...r, model: r.model || activeModels[r.provider] || "auto" })));
      process.exit(0);
    }
  }

  // Discuss mode — autonomous multi-turn debate
  if (discussMode) {
    const config = loadConfig() || defaultConfig();
    const moderatorId = config.pmAgent || config.moderator || "claude";
    const moderatorModel = cliModels[moderatorId] || config.pmModel || activeModels[moderatorId];
    const discussMaxTurns = maxTurns;
    const discussMaxTime = maxTime;

    if (!jsonOutput) {
      console.log(`\n\x1b[90m  Lun — Discussion mode (moderator: ${moderatorId}, max ${discussMaxTurns} turns, ${discussMaxTime}s)\x1b[0m\n`);
    }

    const result = await discuss(fullPrompt, activeProviders, {
      moderator: moderatorId,
      moderatorModel,
      models: activeModels,
      maxTurns: discussMaxTurns,
      maxTime: discussMaxTime,
      timeout: activeTimeout,
      onTurnStart: (turn, question) => {
        if (jsonOutput) {
          console.log(JSON.stringify({ event: "turn_start", turn, question }));
        } else {
          console.log(`\x1b[33m  ━━━ Round ${turn} ━━━\x1b[0m`);
          if (turn > 1) console.log(`  \x1b[90mFollow-up: ${question}\x1b[0m\n`);
        }
      },
      onResult: (r) => {
        if (jsonOutput) {
          console.log(JSON.stringify({ event: "result", provider: r.provider, text: r.text, elapsed: r.elapsed, error: !!r.error }));
        } else {
          const name = PROVIDERS[r.provider]?.name || r.provider;
          console.log(`\x1b[36m  --- ${name} (${r.elapsed}s) ---\x1b[0m`);
          console.log(`  ${(r.text || "").replace(/\n/g, "\n  ")}\n`);
        }
      },
      onSynthesis: (text, elapsed) => {
        if (jsonOutput) {
          console.log(JSON.stringify({ event: "synthesis", text, elapsed }));
        } else {
          console.log(`\x1b[32m  ━━━ Moderator Synthesis (${elapsed}s) ━━━\x1b[0m`);
          console.log(`  ${text.replace(/\n/g, "\n  ")}\n`);
        }
      },
      onFollowup: (question) => {
        if (jsonOutput) {
          console.log(JSON.stringify({ event: "followup", question }));
        } else {
          console.log(`\x1b[90m  → Next question: ${question}\x1b[0m\n`);
        }
      },
      onRoute: (plan) => {
        if (plan.strategy !== "all" && !jsonOutput) {
          console.log(`  \x1b[90m[${plan.intent}] ${plan.reason}\x1b[0m\n`);
        }
      },
    });

    if (jsonOutput) {
      console.log(JSON.stringify({ event: "done", turns: result.turns.length, totalTime: result.totalTime }));
    } else {
      console.log(`\x1b[90m  ━━━ Discussion complete: ${result.turns.length} rounds, ${result.totalTime}s total ━━━\x1b[0m\n`);
    }

    // Save session
    const session = new Session();
    for (const t of result.turns) {
      session.addTurn(t.question, [...t.results.map(r => ({ ...r, model: activeModels[r.provider] || "auto" })), { provider: result.moderator, text: t.synthesis, elapsed: t.synthesisElapsed, model: moderatorModel || "auto", isSynthesis: true }]);
    }

    process.exit(0);
  }

  // One-shot mode
  if (jsonOutput) {
    // NDJSON streaming with moderator routing
    const { intent, strategy, reason, skippedNote, results } = await moderatedQuery(fullPrompt, activeProviders, {
      models: activeModels,
      cwd: process.cwd(),
      timeout: activeTimeout,
      onRoute: (plan) => {
        console.log(JSON.stringify({ event: "start", intent: plan.intent, strategy: plan.strategy, providers: plan.providers, models: activeModels, timestamp: new Date().toISOString() }));
      },
      onChunk: (provider, delta) => {
        console.log(JSON.stringify({ event: "chunk", provider, delta }));
      },
      onResult: (r) => {
        console.log(JSON.stringify({ event: "result", provider: r.provider, model: activeModels[r.provider] || "auto", text: r.text, elapsed: r.elapsed, error: !!r.error }));
      },
    });

    console.log(JSON.stringify({ event: "done", total: results.length, errors: results.filter(r => r.error).length, skippedNote }));

    // Save session
    const session = new Session();
    session.addTurn(fullPrompt, results);

  } else {
    // Human mode — moderated streaming display
    const list = activeProviders.map(p => { const m = activeModels[p]; return m && m !== "auto" ? `${p}(${m})` : p; }).join(", ");
    console.log(`\n\x1b[90m  Lun — ${t("asking", list)}\x1b[0m\n`);

    const { intent, strategy, reason, skippedNote, results } = await moderatedQuery(fullPrompt, activeProviders, {
      models: activeModels,
      cwd: process.cwd(),
      timeout: activeTimeout,
      onRoute: (plan) => {
        if (plan.strategy !== "all") {
          console.log(`  \x1b[90m[${plan.intent}] ${plan.reason}\x1b[0m\n`);
        }
      },
      onResult: (r) => {
        const name = PROVIDERS[r.provider]?.name || r.provider;
        const model = activeModels[r.provider] || "auto";
        if (r.error) {
          console.log(`\x1b[31m  --- ${name} (failed) ---\x1b[0m`);
          console.log(`  ${r.text}\n`);
        } else {
          console.log(`\x1b[36m  --- ${name} (${r.elapsed}s, ${model}) ---\x1b[0m`);
          console.log(`  ${(r.text || "(no response)").replace(/\n/g, "\n  ")}\n`);
        }
      },
    });

    if (skippedNote) {
      console.log(`  \x1b[90m${skippedNote}\x1b[0m\n`);
    }

    // Summarize
    if (summarize && results.filter(r => !r.error).length > 1) {
      const config = loadConfig() || defaultConfig();
      const moderatorId = config.pmAgent || config.moderator || "claude";
      const moderatorModel = config.pmModel || activeModels[moderatorId];
      console.log(`\x1b[33m  --- ${t("summary_title")} (${PROVIDERS[moderatorId]?.name || moderatorId}) ---\x1b[0m`);
      console.log(`  \x1b[90m${t("summarizing")}\x1b[0m`);
      try {
        const sr = await synthesize(moderatorId, fullPrompt, results, { model: moderatorModel, timeout: activeTimeout });
        process.stdout.write("\x1b[1A\x1b[2K");
        console.log(`\x1b[90m  (${sr.elapsed}s, ${moderatorModel || "auto"})\x1b[0m\n`);
        console.log(`  ${(sr.text || "(failed)").replace(/\n/g, "\n  ")}\n`);
      } catch (e) { console.log(`  \x1b[31m${e.message}\x1b[0m\n`); }
    }

    console.log(`\x1b[90m  ────────────────────────────────────────────────────────\x1b[0m\n`);

    // Save session
    const session = new Session();
    session.addTurn(fullPrompt, results.map(r => ({ ...r, model: activeModels[r.provider] || "auto" })));
  }

  process.exit(0);
}

main().catch(err => { console.error(`\x1b[31mFatal:\x1b[0m ${err.message}`); process.exit(1); });
