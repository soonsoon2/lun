# Getting Started

## Prerequisites

- **Node.js 18+** — [Download](https://nodejs.org)
- **At least one AI agent CLI** installed and authenticated

## Installation

```bash
npm install -g lun
```

Or run without installing:
```bash
npx lun "your question"
```

## First-time Setup

Run the interactive setup wizard:

```bash
lun --init
```

This will ask you to:
1. **Choose language** — English, 한국어, or 日本語
2. **Select agents** — Which CLI agents you have installed
3. **Pick models** — Default model for each agent
4. **Set timeout** — How long to wait for responses (default: 120s)

Your config is saved to `~/.lun/config.json`.

## Antigravity CLI Note

Lun calls Antigravity through the `agy` command in print mode.

```bash
agy install
agy -p "hello"
```

## Verify Installation

```bash
# Check which agents are available
lun --list

# View your config
lun --config
```

## Your First Query

```bash
lun "What's the best way to handle authentication in a Node.js API?"
```

You'll see responses from each agent as they arrive, fastest first.

## Next Steps

- [Usage Guide](./usage.md) — All the ways to use lun
- [Agent Integration](./agent-integration.md) — Let your AI agents use lun
- [Models](./models.md) — Available models per provider
