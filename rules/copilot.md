# Lun — Multi-agent Consultation

When facing architecture decisions or design trade-offs, consult other AI agents using `lun` before committing.

## When to use

- Choosing between competing approaches (REST vs GraphQL, etc.)
- Reviewing architecture or system design
- When the user asks for "other opinions" or a "second opinion"

## Commands

```bash
# Ask every configured agent (streamed NDJSON)
lun -j "your question"

# Specific providers / models
lun -j -P kiro,claude,copilot "question"
lun -j -M claude:opus,copilot:gpt-5.4 "question"

# Include file context
cat file.md | lun -j "review this design"

# Add a synthesized recommendation
lun -j -s "question"
```

## Output format

`-j` streams **NDJSON — one JSON object per line**:

```jsonl
{"event":"start","providers":["kiro","claude","copilot"]}
{"event":"result","provider":"copilot","model":"gpt-5.4","text":"...","elapsed":5.1,"error":false}
{"event":"done","total":3,"errors":0}
```

## Models (run `lun -l` for what's installed)

| Provider | Common models |
|----------|---------------|
| kiro | `auto`, `glm-5` |
| claude | `sonnet` (default), `opus`, `haiku` |
| copilot | `auto`, `gpt-5.4`, `claude-sonnet-4.6`, `claude-haiku-4.5` |
| codex | `gpt-5.4`, `gpt-5.5` |
| agy | `auto` |

## After results

Read each `result` line, identify where agents agree/disagree, and present a summary with your recommendation.
