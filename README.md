![Lun multi-agent dashboard](./lun-image.png)

```
      ╦   ╦ ╦ ╔╗╔
      ║   ║ ║ ║║║
      ╩═╝ ╚═╝ ╝╚╝
```

# One question. Multiple minds. Better decisions.

> Not sure about that AI answer?
> Ask multiple agents at once and compare.

[![npm](https://img.shields.io/npm/v/@soonsoon2/lun?style=flat-square&color=cb3837&logo=npm)](https://www.npmjs.com/package/@soonsoon2/lun)
[![GitHub](https://img.shields.io/badge/install-github-181717?style=flat-square&logo=github)](https://github.com/soonsoon2/lun)
[![CI](https://img.shields.io/github/actions/workflow/status/soonsoon2/lun/ci.yml?branch=main&style=flat-square&label=ci)](https://github.com/soonsoon2/lun/actions)
[![license](https://img.shields.io/github/license/soonsoon2/lun?style=flat-square)](LICENSE)
[![site](https://img.shields.io/badge/site-lun.soonsoon.io-74e39b?style=flat-square)](https://lun.soonsoon.io)

---

![Lun in action — asking three agents one question](./demo/lun-demo.gif)

> A real run: `lun -P claude,kiro,copilot "REST or GraphQL?"` — answers stream in as each agent finishes.

---

## What is Lun?

**Lun (論)** runs the AI coding agent CLIs you **already use** — Kiro, Claude Code, GitHub Copilot, Antigravity, Codex — on the same question, side by side. Compare their answers, or let them debate each other.

Most multi-model tools want your API keys and bill you per token. Lun doesn't: it drives the CLIs you've already installed and logged into, so there are **no extra API keys and no extra bills**. Cline is also defined as an optional provider when its CLI is available.

```
$ lun "Should I use REST or GraphQL for this API?"

  Lun — Asking kiro, claude, copilot, agy, codex...

  --- Kiro (4.2s, auto) ---
  REST is the better fit here. Your API is resource-oriented
  with simple CRUD operations, and REST gives you caching,
  standard HTTP semantics, and simpler client code...

  --- Claude (3.8s, sonnet) ---
  I'd lean toward GraphQL. You mentioned multiple frontend
  clients with different data needs — GraphQL's flexible
  queries avoid over-fetching and reduce round trips...

  --- Copilot (5.1s, auto) ---
  Consider a hybrid: REST for public endpoints, GraphQL
  for your internal dashboard that needs flexible queries...

  ────────────────────────────────────────────────────────
```

**Results stream in as each agent finishes.** No waiting for the slowest one.

---

## Why?

A single AI opinion can be confidently wrong. When you're making decisions that matter — architecture, tech stack, API design — you want multiple perspectives:

- **2 out of 3 agree?** → Higher confidence
- **All 3 disagree?** → The problem needs more thought
- **One has a unique angle?** → You might have missed something

Lun makes this a 10-second habit instead of a 10-minute tab-switching ritual.

---

## Three modes

Lun gives your agents three ways to work on a question. The same engine powers all of them.

### 1. Compare — `lun "question"`

Every agent answers the same question in parallel; answers stream in side by side as each finishes. Add `-s` to get a synthesized consensus on top.

```bash
lun "Should I use REST or GraphQL for this API?"
lun -s "Redis vs Memcached for sessions?"   # + consensus summary
```

### 2. Debate — `lun -d` ⭐

Not just parallel answers — a **relay discussion**. Each agent sees what the previous ones said and can challenge it; a moderator synthesizes each round and decides whether to continue. This is where blind spots actually surface, because the agents argue instead of just listing opinions.

```bash
lun -d "Is a monorepo the right call for a 4-person team?"
lun -d --max-turns 2 "Critique this caching strategy"
```

### 3. PM chat — `lun chat`

A conversation led by a "PM" agent that decides which specialists to consult, calls them as tools, and synthesizes — with history across turns.

```bash
lun chat
```

> **No daemon required.** `lun "question"` works on its own. Running
> `lun daemon start` (or `lun serve`) is optional — it keeps agents warm so
> repeat calls skip CLI cold-start. `LUN_NO_DAEMON=1` forces direct mode.

## Run it anywhere

The three modes are available across every surface:

| Surface | How | Notes |
|---------|-----|-------|
| **Terminal** | `lun "q"`, `lun -d`, `lun chat`, or `lun` (REPL) | Nothing to set up beyond one agent CLI |
| **Web UI** | `lun serve` → `localhost:3456` | Group-chat view, streaming, history, usage |
| **VS Code / Copilot Chat** | `@lun` (install the VSIX) | Stay in your editor |
| **Another AI agent** | `lun -j "q"` | NDJSON output; let an agent consult the panel and parse it |

---

## Install

```bash
npm install -g @soonsoon2/lun
```

The command is `lun`. (Installs from npm; `npm install -g github:soonsoon2/lun` also works for the latest `main`.)

You need at least one AI agent CLI installed:

| Agent | Install | What you get |
|-------|---------|--------------|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `npm i -g @anthropic-ai/claude-code` | Anthropic's reasoning |
| [GitHub Copilot](https://docs.github.com/copilot) | `gh extension install github/gh-copilot` | OpenAI/GPT models |
| [Kiro CLI](https://kiro.dev/docs/cli) | `npm i -g kiro-cli` | AWS-backed multi-model |
| Antigravity CLI | `agy install` | Google Antigravity agent |
| [Codex CLI](https://github.com/openai/codex) | `npm i -g @openai/codex` | OpenAI Codex agent |
| [Cline CLI](https://github.com/cline/cline) | `npm i -g @anthropic-ai/cline` | Multi-provider |

### Antigravity CLI setup

Lun calls Antigravity through `agy` in print mode:

```bash
agy install
agy -p "hello"
```

> Adding a new provider is a single file edit in `src/providers.js`.

---

## Quick Start

```bash
# First time — pick language, agents, models
lun --init

# Compare: ask everyone the same thing
lun "How should I structure this microservice?"

# Debate: let them challenge each other
lun -d "Is a monorepo the right call for a 4-person team?"

# Pipe a file as context
cat design.md | lun "What are the risks here?"

# Pick specific models
lun -M claude:opus,copilot:gpt-4.1 "Review this architecture"
```

---

## What debate looks like

`lun -d` is the mode that sets Lun apart. Instead of parallel monologues, each agent sees the previous answers and pushes back, and a moderator synthesizes each round:

```
$ lun -d "Tabs or spaces?"

  --- Claude (5.5s) ---
  Spaces. They render identically everywhere — no surprises from someone's
  tab width turning aligned code into a ransom note.

  --- Copilot (9.8s) ---
  Tabs. One character per indent level, and accessibility wins: readers can
  set their own width. Style guides chose spaces for historical reasons.

  ━━━ Moderator Synthesis ━━━
  Both agree consistency matters more than the choice. Recommendation: tabs
  + .editorconfig if accessibility matters; spaces for byte-identical
  rendering across every editor.
```

The PM chat mode (`lun chat`) is configured in `lun --init` (`pmAgent` /
`pmModel`); it keeps history and saves each agent's full output to the session.

---

## For Agent Integration

Other AI agents can call lun and parse the output:

```bash
lun -j "Should I use a monorepo?"
```

Outputs NDJSON (one event per line, results stream as they arrive):

```jsonl
{"event":"start","providers":["kiro","claude","copilot","agy","codex"]}
{"event":"chunk","provider":"claude","delta":"I'd recommend..."}
{"event":"result","provider":"claude","model":"sonnet","text":"...","elapsed":3.8,"error":false}
{"event":"result","provider":"kiro","model":"auto","text":"...","elapsed":5.2,"error":false}
{"event":"result","provider":"copilot","model":"auto","text":"...","elapsed":12.1,"error":false}
{"event":"result","provider":"agy","model":"auto","text":"...","elapsed":6.8,"error":false}
{"event":"result","provider":"codex","model":"gpt-5.4","text":"...","elapsed":8.1,"error":false}
{"event":"done","total":5,"errors":0}
```

### Tell your agent to use lun

Add to your project's agent rules, or just say:

> "Use `lun -j "question"` to get opinions from other AI agents before making this decision."

Or auto-install rules for all agents:

```bash
lun --setup-rules
```

This adds lun consultation rules for Claude (`CLAUDE.md`), Kiro
(`.kiro/steering/lun.md`), Copilot (`.github/copilot-instructions.md`),
Antigravity, and Codex.

> **It edits files your agents read,** which changes how they behave. So it
> shows exactly which files will be created or appended, asks you to confirm
> before anything is written, and then confirms each file individually.
> Existing files are appended to (never overwritten), and the added block is
> wrapped in `<!-- BEGIN lun rules -->` / `<!-- END lun rules -->` markers so
> you can find and remove it. Review with `git diff` afterward.

---

## All Options

```
lun [options] [prompt]

Modes:
  lun                        Interactive (REPL)
  lun chat                   PM-style Lun Agent conversation
  lun "prompt"               One-shot
  cat file | lun "review"    Pipe context
  lun serve                  Start web UI (localhost:3456)
  lun daemon                 Start daemon dashboard in foreground
  lun daemon start           Start daemon in background
  lun daemon stop            Stop background daemon
  lun daemon status          Show daemon status

Options:
  -P, --providers <list>     Agents to use (kiro,claude,copilot,agy,codex)
  -M, --models <list>        Models (claude:opus,copilot:gpt-4.1)
  -s, --summarize            Synthesize all answers
  -d, --discuss              Autonomous discussion mode
  --chat                     Use daemon PM chat mode for one-shot prompt
  --ask                      Use daemon multi-agent ask mode
  -j, --json                 NDJSON streaming output
  -t, --timeout <sec>        Timeout (default: 120)

Info:
  -l, --list                 Available providers
  -H, --sessions             Saved sessions
  -v, --version              Version
  -h, --help                 Help

Setup:
  --init                     First-time config
  --config                   View config
  --setup-rules              Install agent rules in project
```

---

## Workspace

Lun keeps everything you might want to see in one folder — the **workspace**,
at `~/Documents/lun-workspace` by default (set it in `lun --init`):

```
~/Documents/lun-workspace/
├── run/        # where agents actually run (kept empty/small so kiro & codex stay fast)
├── sessions/   # every conversation, saved as .md + .json
├── logs/       # daemon + usage logs
└── reports/    # full per-agent reports from PM chat
```

Why a dedicated `run/` folder? kiro and codex scan their working directory on
startup. Running them from a huge `$HOME` made kiro ~3-4x slower. The isolated
`run/` dir keeps them fast no matter where you invoke `lun`. To make agents
operate on a real project instead, run from that project with `LUN_USE_CWD=1`.

## Sessions

Every conversation is auto-saved to `<workspace>/sessions/` as both `.md`
(human-readable) and `.json` (machine-parseable).

```bash
# View recent sessions
lun --sessions

# Sessions are at, e.g.:
~/Documents/lun-workspace/sessions/2026-05-09T15-30-22.md
~/Documents/lun-workspace/sessions/2026-05-09T15-30-22.json
```

---

## Web UI

Lun also has a local web interface with a group-chat style UI:

```bash
lun serve
# → http://localhost:3456
```

`lun serve` runs with warm workers (daemon mode) for the life of the process
and stays up until you stop it with Ctrl+C. It binds to `127.0.0.1` only —
see [SECURITY.md](SECURITY.md) before changing `LUN_HOST`. (To auto-exit when
the browser tab closes — e.g. for an app wrapper — set `LUN_SERVE_AUTOEXIT=1`.)

Custom port:
```bash
LUN_PORT=8080 lun serve
```

Features: real-time streaming, session history sidebar, per-agent model settings, smart routing with system messages, daemon usage stats, logs, and worker status.

### Daemon worker model

`lun daemon start` keeps the dashboard API and warm agent workers running in the background. By default, persistent workers are prewarmed for the workspace where the daemon starts; requests from a different workspace create that workspace's worker on first use. Worker status is visible in the web UI, VS Code panel, or with `@lun /workers`.

| Agent | Daemon strategy | Notes |
|-------|-----------------|-------|
| Kiro | Persistent ACP worker | `kiro-cli acp` stays alive; each prompt gets a fresh ACP session by default. |
| GitHub Copilot | Persistent ACP worker | `copilot --acp --stdio` stays alive; each prompt gets a fresh ACP session by default. |
| Claude Code | Persistent stream-json worker | `claude` stays alive and receives prompts over stdin. |
| Codex | Persistent SDK thread cache | Uses `@openai/codex-sdk` threads instead of spawning `codex exec` each turn. |
| Antigravity | Queued spawn-per-turn worker | `agy` currently has no stable ACP/stdio daemon protocol exposed, so Lun keeps queueing/usage/logging but still invokes print mode per request. |

The daemon removes process startup overhead where the agent exposes a machine protocol. Kiro and Copilot keep the ACP process warm but use a fresh ACP session per prompt by default, which avoids long-lived context buildup while still skipping CLI cold start. Set `LUN_ACP_REUSE_SESSION=1` only if you explicitly want provider-side session memory.

CLI requests use the same streaming daemon endpoint as VS Code, so long Kiro runs show ACP phase changes, streamed chunks when the agent emits them, and heartbeat lines while the worker is busy. Model thinking time, tool use, network latency, and project file reading still remain the real floor.

---

## VS Code Extension

Lun can also run inside VS Code and Copilot Chat.

Download and install the bundled VSIX from this repository:

[Download `lun-0.2.5.vsix`](./extensions/vscode-lun/lun-0.2.5.vsix)

Direct raw download:

```txt
https://github.com/soonsoon2/lun/raw/main/extensions/vscode-lun/lun-0.2.5.vsix
```

In VS Code:

1. Open Extensions.
2. Choose `Install from VSIX...`.
3. Select the downloaded `lun-0.2.5.vsix` file.
4. Run `Developer: Reload Window`.

The extension connects to the local daemon at `http://127.0.0.1:3456`. If the daemon is not running, it can start it automatically.

### VS Code Chat and Copilot Chat

When VS Code Chat or Copilot Chat is available, Lun registers as `@lun`:

```txt
@lun review this project
@lun /review
@lun /diagnostics
@lun /status
@lun /workers
```

Long-running requests stream progress before the final answer, so you can see which stage is active:

```txt
0.1s: Lun daemon received the request
0.2s: claude PM is planning the request
0.3s: claude PM thinking, round 1
1.8s: claude is drafting or routing
8.4s: Calling all available specialist agents
15.2s: agy finished in 6.8s
```

The separate `Lun: Open Panel` command remains useful for daemon status, workers, usage, and logs.
When Lun delegates to other agents, the Chat response shows the PM summary first and saves each model's full output to a Markdown report you can open on demand.

---

## Configuration

Stored at `~/.lun/config.json`:

```json
{
  "language": "en",
  "providers": ["kiro", "claude", "copilot", "agy", "codex"],
  "models": {
    "kiro": "glm-5",
    "claude": "opus",
    "copilot": "claude-haiku-4.5",
    "agy": "auto",
    "codex": "gpt-5.4"
  },
  "pmAgent": "claude",
  "pmModel": "sonnet",
  "moderator": "copilot",
  "timeout": 120,
  "workDir": "~/Documents/lun-workspace"
}
```

`workDir` is the workspace root (see [Workspace](#workspace)). Sessions, logs,
and reports live inside it by default; set `sessionsPath` only if you want
sessions stored somewhere else.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LUN_PORT` | `3456` | Web UI port |
| `LUN_HOST` | `127.0.0.1` | Web UI bind address |
| `LUN_USE_CWD` | unset | Set to `1` to run agents in the current directory instead of the configured work dir |
| `LUN_NO_DAEMON` | unset | Set to `1` to always run agents directly, skipping the daemon |
| `LUN_SERVE_AUTOEXIT` | unset | Set to `1` to make `lun serve` exit when the browser tab closes (off by default) |
| `LUN_PREWARM_WORKERS` | `1` | Set to `0` to skip daemon worker prewarm on startup |
| `LUN_DISABLE_ACP_WORKER` | unset | Set to `1` to force Kiro/Copilot back to spawn-per-turn mode |
| `LUN_ACP_REUSE_SESSION` | unset | Set to `1` to reuse Kiro/Copilot ACP sessions across prompts |
| `PORT` | `3456` | Alternative port variable |

---

## Adding a Provider

Edit `src/providers.js`:

```javascript
myagent: {
  name: "My Agent",
  bin: "myagent-cli",
  defaultModel: "default",
  installHint: "npm i -g myagent",
  buildArgs: (prompt, model, opts) => ["-p", prompt, "--model", model],
  env: { TERM: "dumb" },
  getModels: () => [{ id: "default", label: "default" }],
},
```

---

## Requirements

- Node.js >= 18
- At least one AI agent CLI installed and authenticated

## Contributing

Contributions, new providers, and forks are welcome. See
[CONTRIBUTING.md](CONTRIBUTING.md) to get started, and please follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Lun is a local tool that auto-approves agent tool use and runs an
**unauthenticated** local server (localhost only by default). Please read
[SECURITY.md](SECURITY.md) before exposing it beyond your own machine, and
report vulnerabilities privately rather than as public issues.

## License

[MIT](LICENSE) © SOONSOON

