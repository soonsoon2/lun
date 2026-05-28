```
      ╦   ╦ ╦ ╔╗╔
      ║   ║ ║ ║║║
      ╩═╝ ╚═╝ ╝╚╝
```

# One question. Multiple minds. Better decisions.

> Not sure about that AI answer?
> Ask multiple agents at once and compare.

[![npm](https://img.shields.io/npm/v/lun?style=flat-square)](https://www.npmjs.com/package/lun)
[![license](https://img.shields.io/github/license/soonsoon2/lun?style=flat-square)](LICENSE)

---

## What is Lun?

**Lun (論)** is a CLI tool that asks multiple AI coding agents the same question in parallel and shows you their answers side-by-side — so you can spot consensus, catch blind spots, and make better design decisions.

Currently supports **3 agents** (Kiro, Claude Code, GitHub Copilot) with more coming soon.

```
$ lun "Should I use REST or GraphQL for this API?"

  Lun — Asking kiro, claude, copilot...

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

## Install

```bash
npm install -g lun
```

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

# Ask all agents (results stream as they arrive)
lun "How should I structure this microservice?"

# Interactive mode — keep asking
lun

# Specific models for deeper analysis
lun -M claude:opus,copilot:gpt-4.1 "Review this architecture"

# Pipe a file as context
cat design.md | lun "What are the risks here?"

# Auto-synthesize all answers into one recommendation
lun -s "Redis vs Memcached for session storage?"
```

---

## For Agent Integration

Other AI agents can call lun and parse the output:

```bash
lun -j "Should I use a monorepo?"
```

Outputs NDJSON (one event per line, results stream as they arrive):

```jsonl
{"event":"start","providers":["kiro","claude","copilot"]}
{"event":"chunk","provider":"claude","delta":"I'd recommend..."}
{"event":"result","provider":"claude","model":"sonnet","text":"...","elapsed":3.8,"error":false}
{"event":"result","provider":"kiro","model":"auto","text":"...","elapsed":5.2,"error":false}
{"event":"result","provider":"copilot","model":"auto","text":"...","elapsed":12.1,"error":false}
{"event":"done","total":3,"errors":0}
```

### Tell your agent to use lun

Add to your project's agent rules, or just say:

> "Use `lun -j "question"` to get opinions from other AI agents before making this decision."

Or auto-install rules for all agents:

```bash
lun --setup-rules
```

This creates rule files for Claude (`CLAUDE.md`), Kiro (`.kiro/steering/lun.md`), Copilot (`.github/copilot-instructions.md`), Antigravity, and Codex.

---

## All Options

```
lun [options] [prompt]

Modes:
  lun                        Interactive (REPL)
  lun "prompt"               One-shot
  cat file | lun "review"    Pipe context
  lun serve                  Start web UI (localhost:3456)

Options:
  -P, --providers <list>     Agents to use (kiro,claude,copilot)
  -M, --models <list>        Models (claude:opus,copilot:gpt-4.1)
  -s, --summarize            Synthesize all answers
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

## Sessions

Every conversation is auto-saved to `~/.lun/sessions/` as both `.md` (human-readable) and `.json` (machine-parseable).

```bash
# View recent sessions
lun --sessions

# Sessions are at:
~/.lun/sessions/2026-05-09T15-30-22.md
~/.lun/sessions/2026-05-09T15-30-22.json
```

---

## Web UI

Lun also has a local web interface with a group-chat style UI:

```bash
lun serve
# → http://localhost:3456
```

Custom port:
```bash
LUN_PORT=8080 lun serve
```

Features: real-time streaming, session history sidebar, per-agent model settings, smart routing with system messages.

---

## VS Code Extension

Lun can also run inside VS Code and Copilot Chat.

Install the bundled VSIX from this repository:

```txt
extensions/vscode-lun/lun-0.2.2.vsix
```

In VS Code:

1. Open Extensions.
2. Choose `Install from VSIX...`.
3. Select `extensions/vscode-lun/lun-0.2.2.vsix`.
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

---

## Configuration

Stored at `~/.lun/config.json`:

```json
{
  "language": "en",
  "providers": ["kiro", "claude", "copilot"],
  "models": { "kiro": "auto", "claude": "sonnet", "copilot": "auto" },
  "timeout": 120
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LUN_PORT` | `3456` | Web UI port |
| `LUN_HOST` | `127.0.0.1` | Web UI bind address |
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

## License

MIT
