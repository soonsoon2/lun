# Lun (論)

> Multi-agent consensus for better decisions.

Ask multiple AI coding agents the same question simultaneously, compare their answers side-by-side, and optionally synthesize a combined recommendation.

```
$ lun "Should I use REST or GraphQL for this API?"

  Lun — Asking kiro, claude, copilot...

  v Kiro           4.2s (auto)
  v Claude Code    3.8s (sonnet)
  v GitHub Copilot 5.1s (auto)

  --- Kiro (4.2s, auto) ---
  REST is more appropriate here because...

  --- Claude Code (3.8s, sonnet) ---
  I'd recommend GraphQL for this use case...

  --- GitHub Copilot (5.1s, auto) ---
  Consider a hybrid approach...
```

## Why

When making design decisions, a single AI opinion can be misleading. Lun gives you multiple perspectives in seconds, so you can spot consensus, identify blind spots, and make informed choices.

- **Compare** — See where agents agree and disagree
- **Synthesize** — Auto-generate a summary of all opinions (`--summarize`)
- **Integrate** — JSON output mode for agent-to-agent workflows (`--json`)
- **Record** — Every session saved as `.md` and `.json` for future reference

## Install

```bash
npm install -g lun
```

**Prerequisites:** At least one of these CLI agents must be installed:

| Agent | Install |
|-------|---------|
| [Kiro CLI](https://kiro.dev/docs/cli) | `npm i -g kiro-cli` |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `npm i -g @anthropic-ai/claude-code` |
| [GitHub Copilot CLI](https://docs.github.com/copilot/how-tos/copilot-cli) | `gh extension install github/gh-copilot` |

## Quick Start

```bash
# First-time setup (language, agents, models)
lun --init

# Ask all agents
lun "How should I structure this microservice?"

# Interactive mode (REPL)
lun

# Pipe content as context
cat architecture.md | lun "Review this design"

# With synthesis
lun -s "Compare Redis vs Memcached for session storage"
```

## Usage

```
lun [options] [prompt]
```

### Modes

| Command | Description |
|---------|-------------|
| `lun` | Interactive REPL — type questions, get multi-agent answers |
| `lun "prompt"` | One-shot — ask once, get answers, exit |
| `cat file \| lun "review"` | Pipe — include file content as context |

### Options

| Flag | Description |
|------|-------------|
| `-P, --providers <list>` | Comma-separated providers (e.g. `kiro,claude`) |
| `-M, --models <list>` | Per-provider models (e.g. `claude:opus,copilot:gpt-4.1`) |
| `-s, --summarize` | Add a synthesis of all answers |
| `-j, --json` | JSON output (for agent integration) |
| `-t, --timeout <sec>` | Timeout in seconds (default: 120) |
| `-l, --list` | Show available providers |
| `-H, --sessions` | List saved sessions |
| `-v, --version` | Version |
| `-h, --help` | Help |

### Setup

| Command | Description |
|---------|-------------|
| `lun --init` | Interactive first-time setup |
| `lun --config` | View current configuration |

## JSON Output (Agent Integration)

Use `--json` when another agent needs to consume Lun's output:

```bash
lun -j "Should I use a monorepo?"
```

```json
{
  "prompt": "Should I use a monorepo?",
  "timestamp": "2026-05-09T06:30:00.000Z",
  "results": [
    { "provider": "kiro", "model": "auto", "text": "...", "elapsed": 4.2, "error": false },
    { "provider": "claude", "model": "sonnet", "text": "...", "elapsed": 3.8, "error": false },
    { "provider": "copilot", "model": "auto", "text": "...", "elapsed": 5.1, "error": false }
  ]
}
```

## Sessions

Every query is automatically saved to `~/.lun/sessions/`:

- **`.json`** — Structured data for programmatic access
- **`.md`** — Human-readable markdown for review or sharing

View recent sessions:
```bash
lun --sessions
```

## Web UI

Lun also includes a local web interface with a group-chat style UI:

```bash
# Start the web server
npm start
# or
node server.js

# Open http://localhost:3456
```

## Configuration

Config is stored at `~/.lun/config.json`:

```json
{
  "language": "en",
  "providers": ["kiro", "claude", "copilot"],
  "models": {
    "kiro": "auto",
    "claude": "sonnet",
    "copilot": "auto"
  },
  "timeout": 120
}
```

## Adding Providers

Providers are defined in `src/providers.js`. To add a new agent:

```javascript
export const PROVIDERS = {
  // ...existing providers
  myagent: {
    name: "My Agent",
    bin: "myagent-cli",
    defaultModel: "default",
    installHint: "npm i -g myagent-cli",
    buildArgs: (prompt, model, opts) => ["-p", prompt, "--model", model],
    env: { TERM: "dumb" },
    getModels: () => [{ id: "default", label: "default" }],
  },
};
```

## Requirements

- Node.js >= 18
- At least one supported AI CLI agent installed and authenticated

## License

MIT
