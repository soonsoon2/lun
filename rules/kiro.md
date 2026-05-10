---
inclusion: manual
---

# Lun — Multi-agent Consultation

When facing architecture decisions or design trade-offs, consult other AI agents using `lun`.

## When to use

- Choosing between competing approaches
- Reviewing architecture or system design
- When the user asks for "other opinions"

## Commands

```bash
# All agents
lun -j "question"

# Specific models
lun -j -M kiro:claude-sonnet-4.6,claude:opus,copilot:gpt-4.1 "question"

# With file context
cat file.md | lun -j "review this"

# With synthesis
lun -j -s "question"
```

## Models

- kiro: auto, claude-opus-4.6, claude-sonnet-4.6, claude-haiku-4.5, deepseek-3.2
- claude: sonnet, opus, haiku
- copilot: auto, gpt-5.2, gpt-4.1, o3

## After results

Read the JSON output, identify consensus/disagreements, present summary with recommendation.
