# Usage Guide

## Modes

### One-shot Mode

Ask a question, get answers, exit:

```bash
lun "REST vs GraphQL for a mobile app backend?"
```

### Interactive Mode (REPL)

Just type `lun` with no arguments:

```bash
$ lun

  Lun v1.1.0
  Multi-agent consensus for decisions

  Type a question (Ctrl+C to exit, /save to end session)

  > What's the best database for this use case?
  
  --- Kiro (4.2s, auto) ---
  ...

  > What about scaling concerns?
  
  --- Claude (3.1s, sonnet) ---
  ...
```

Type `/save` or `/quit` to end and save the session.

### Pipe Mode

Include file content as context:

```bash
# Review a design doc
cat architecture.md | lun "What are the risks in this design?"

# Review code
cat src/auth.ts | lun "Is this authentication flow secure?"

# Multiple files
cat package.json tsconfig.json | lun "Is this config optimal?"
```

## Options

### Select Providers

```bash
# Only ask Claude and Kiro
lun -P kiro,claude "question"

# Only Copilot
lun -P copilot "question"
```

### Select Models

```bash
# Claude with Opus (highest quality)
lun -M claude:opus "complex architecture question"

# Multiple models
lun -M claude:opus,copilot:gpt-4.1,kiro:claude-sonnet-4.6 "question"
```

### Synthesis Mode

Auto-generate a combined recommendation from all answers:

```bash
lun -s "Should I use microservices or a monolith?"
```

This runs all agents, then sends their answers to Claude to produce a synthesis with:
1. Common points
2. Key differences
3. Final recommendation

### JSON Output (NDJSON Streaming)

For programmatic use or agent integration:

```bash
lun -j "question"
```

Events stream as newline-delimited JSON:
```jsonl
{"event":"start","providers":["kiro","claude","copilot"]}
{"event":"chunk","provider":"claude","delta":"partial text..."}
{"event":"result","provider":"claude","model":"sonnet","text":"full answer","elapsed":3.8,"error":false}
{"event":"result","provider":"kiro","model":"auto","text":"full answer","elapsed":5.2,"error":false}
{"event":"done","total":3,"errors":0}
```

### Timeout

```bash
# 60 second timeout
lun -t 60 "quick question"

# 5 minute timeout for complex queries
lun -t 300 "analyze this entire codebase structure"
```

## Sessions

Every query is auto-saved to `~/.lun/sessions/`:

```bash
# View recent sessions
lun --sessions

# Files are saved as both .md and .json
~/.lun/sessions/2026-05-09T15-30-22.md    # Human-readable
~/.lun/sessions/2026-05-09T15-30-22.json  # Machine-parseable
```

### Session Markdown Format

```markdown
# Lun Session — 2026-05-09 15:30

## Q1: REST vs GraphQL?

### Kiro (4.2s, auto)
REST is better because...

### Claude (3.8s, sonnet)
GraphQL because...

---

## Q2: What about caching?
...
```

## Tips

- **Short questions get short answers** — Be specific for better results
- **Include context** — Pipe relevant files for more informed opinions
- **Use opus for important decisions** — `lun -M claude:opus` for architecture choices
- **Save time with `-P`** — Use fewer providers for quick checks
- **Use `-s` for final decisions** — The synthesis helps when agents disagree
