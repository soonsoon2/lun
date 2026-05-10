#!/usr/bin/env node
/**
 * 論 (Lun) — Multi-agent consensus CLI.
 * Entry point for `lun` command.
 */
import { PROVIDERS, checkAvailable, getAvailableProviders } from "../src/providers.js";
import { runProvider, runAll } from "../src/runner.js";
import { moderatedQuery, detectIntent } from "../src/moderator.js";
import { loadConfig, saveConfig, defaultConfig, ensureDirs, CONFIG_PATH, SESSIONS_DIR } from "../src/config.js";
import { Session, listSessions } from "../src/session.js";
import { t } from "../src/i18n.js";
import { printBanner, selectFromList, promptText, Progress, VERSION } from "../src/ui.js";
import { createInterface } from "readline";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ============================================================
// ARGS
// ============================================================
const args = process.argv.slice(2);
let cliProviders = null;
let cliModels = {};
let summarize = false;
let jsonOutput = false;
let timeout = null;
let promptParts = [];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--init") { await cmdInit(); process.exit(0); }
  if (a === "--config") { cmdConfig(); process.exit(0); }
  if (a === "--setup-rules") { await cmdSetupRules(); process.exit(0); }
  if (a === "serve") { await cmdServe(); process.exit(0); }
  if (a === "--providers" || a === "-P") { cliProviders = args[++i]?.split(",").map(s => s.trim()).filter(Boolean); }
  else if (a === "--models" || a === "-M") {
    for (const pair of (args[++i] || "").split(",")) { const [p, m] = pair.split(":"); if (p && m) cliModels[p.trim()] = m.trim(); }
  }
  else if (a === "--summarize" || a === "-s") { summarize = true; }
  else if (a === "--json" || a === "-j") { jsonOutput = true; }
  else if (a === "--timeout" || a === "-t") { timeout = parseInt(args[++i]) * 1000 || null; }
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
      models[pid] = sel;
    }
  }

  console.log("");
  const timeoutStr = await promptText(t("timeout_prompt"), "120");

  const config = { language: lang, providers, models, timeout: parseInt(timeoutStr) || 120 };
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
  console.log(`  Timeout:   ${config.timeout}s`);
  console.log(`  Sessions:  ${SESSIONS_DIR}\n`);
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
  console.log(`\n  \x1b[90mPath: ${SESSIONS_DIR}\x1b[0m\n`);
}

function cmdHelp() {
  printBanner();
  console.log(`  \x1b[1mUsage:\x1b[0m
    lun                        Interactive mode (REPL)
    lun "prompt"               One-shot query to all agents
    cat file | lun "review"    Pipe content as context

  \x1b[1mOptions:\x1b[0m
    -P, --providers <list>     Providers (comma-separated)
    -M, --models <list>        Models (provider:model,...)
    -s, --summarize            Add synthesis of all answers
    -j, --json                 JSON output (for agent integration)
    -t, --timeout <sec>        Timeout (default: 120)
    -l, --list                 List available providers
    -H, --sessions             View saved sessions
    -v, --version              Version
    -h, --help                 This help

  \x1b[1mSetup:\x1b[0m
    lun --init                 First-time configuration
    lun --config               View current config
    lun --setup-rules          Install lun rules into current project
    lun serve                  Start web UI (default: localhost:3456)

  \x1b[1mExamples:\x1b[0m
    lun "REST vs GraphQL?"
    lun -M claude:opus "deep analysis"
    lun -j "machine-readable query"
    lun -P kiro,claude -s "summarize too"
`);
}

function printInstallHelp() {
  console.log(`\n  \x1b[90m${t("install_help")}\x1b[0m`);
  console.log(`    kiro:    https://kiro.dev/docs/cli`);
  console.log(`    claude:  npm i -g @anthropic-ai/claude-code`);
  console.log(`    copilot: gh extension install github/gh-copilot`);
}

// ============================================================
// SERVE — start web UI
// ============================================================
async function cmdServe() {
  const port = process.env.LUN_PORT || process.env.PORT || 3456;
  const serverPath = new URL("../server.js", import.meta.url).pathname;
  const { spawn: spawnChild } = await import("child_process");

  console.log(`\n  \x1b[90mStarting Lun web UI on port ${port}...\x1b[0m\n`);

  const child = spawnChild("node", [serverPath], {
    stdio: "inherit",
    env: { ...process.env, LUN_PORT: String(port) },
  });

  child.on("error", (err) => {
    console.error(`  \x1b[31mFailed to start server:\x1b[0m ${err.message}`);
    process.exit(1);
  });

  // Keep process alive
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
  const rulesDir = new URL("../rules/", import.meta.url).pathname;

  const targets = [
    { id: "claude", file: "claude.md", dest: "CLAUDE.md", append: true, desc: "Claude Code (CLAUDE.md)" },
    { id: "kiro", file: "kiro.md", dest: ".kiro/steering/lun.md", append: false, desc: "Kiro (.kiro/steering/lun.md)" },
    { id: "copilot", file: "copilot.md", dest: ".github/copilot-instructions.md", append: true, desc: "Copilot (.github/copilot-instructions.md)" },
    { id: "gemini", file: "gemini.md", dest: ".gemini/AGENTS.md", append: true, desc: "Gemini (.gemini/AGENTS.md)" },
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

  // One-shot mode
  if (jsonOutput) {
    // NDJSON streaming with moderator routing
    const { intent, strategy, reason, skippedNote, results } = await moderatedQuery(fullPrompt, activeProviders, {
      models: activeModels,
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
      console.log(`\x1b[33m  --- ${t("summary_title")} ---\x1b[0m`);
      console.log(`  \x1b[90m${t("summarizing")}\x1b[0m`);
      const sp = `Analyze these AI agent responses. Summarize: 1) Common points 2) Differences 3) Recommendation.\n\nQuestion: ${fullPrompt}\n\n` +
        results.filter(r => !r.error).map(r => `### ${PROVIDERS[r.provider]?.name}\n${r.text}`).join("\n\n");
      try {
        const sr = await runProvider("claude", sp, { model: activeModels.claude || "sonnet", timeout: activeTimeout });
        process.stdout.write("\x1b[1A\x1b[2K");
        console.log(`\x1b[90m  (${sr.elapsed}s, ${activeModels.claude || "sonnet"})\x1b[0m\n`);
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
