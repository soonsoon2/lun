---
inclusion: manual
---

# Lun — Multi-agent Consultation

When facing architecture decisions or design trade-offs, consult other AI agents using `lun` before committing.

## When to use

- Choosing between competing approaches
- Reviewing architecture or system design
- When the user asks for "other opinions"

## Commands

```bash
# Ask every configured agent (streamed NDJSON)
lun -j "question"

# Specific providers / models
lun -j -P kiro,claude,copilot "question"
lun -j -M claude:opus,copilot:gpt-5.4 "question"

# File context
cat file.md | lun -j "review this"

# Add a synthesized recommendation
lun -j -s "question"
```

## Output format

`-j` streams **NDJSON — one JSON object per line**:

```jsonl
{"event":"start","providers":["kiro","claude","copilot"]}
{"event":"result","provider":"claude","model":"opus","text":"...","elapsed":3.8,"error":false}
{"event":"done","total":3,"errors":0}
```

## Models (run `lun -l` for what's installed)

- kiro: `auto`, `glm-5`
- claude: `sonnet`, `opus`, `haiku`
- copilot: `auto`, `gpt-5.4`, `claude-sonnet-4.6`
- codex: `gpt-5.4`, `gpt-5.5`
- agy: `auto`

## After results

Read each `result` event, identify consensus/disagreements, present a summary with your recommendation.
