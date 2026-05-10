# Lun — Multi-agent Consultation

When facing architecture decisions or design trade-offs, consult other AI agents using `lun` before proceeding.

## When to use

- Choosing between competing approaches (REST vs GraphQL, etc.)
- Reviewing architecture or system design
- When the user asks for "other opinions" or "second opinion"

## Commands

```bash
# All agents respond
lun -j "your question"

# Specific models
lun -j -M kiro:claude-sonnet-4.6,claude:opus,copilot:gpt-4.1 "question"

# Include file context
cat file.md | lun -j "review this design"

# With auto-synthesis
lun -j -s "question"
```

## Models

| Provider | Options |
|----------|---------|
| kiro | auto, claude-opus-4.6, claude-sonnet-4.6, claude-haiku-4.5, deepseek-3.2 |
| claude | sonnet (default), opus, haiku |
| copilot | auto (default), gpt-5.2, gpt-4.1, o3, claude-sonnet-4.6 |

## After results

Parse the JSON results array, identify where agents agree/disagree, and present a summary with your recommendation.
