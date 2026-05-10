# Lun — Multi-agent Consultation

When facing architecture decisions or design trade-offs, use `lun` to get opinions from other AI agents.

## When to use

- Architecture or design decisions with multiple valid approaches
- Trade-off evaluation
- When user requests "other opinions"

## Commands

```bash
# Query all agents
lun -j "your question"

# With specific models
lun -j -M kiro:claude-sonnet-4.6,claude:opus,copilot:gpt-4.1 "question"

# Pipe file as context
cat file.md | lun -j "review this"

# Auto-synthesize
lun -j -s "question"
```

## Models

- kiro: auto, claude-opus-4.6, claude-sonnet-4.6, claude-haiku-4.5, deepseek-3.2
- claude: sonnet (default), opus, haiku
- copilot: auto (default), gpt-5.2, gpt-4.1, o3

## Output

JSON with `results` array containing each agent's `provider`, `model`, `text`, `elapsed`.

## After results

Summarize consensus and disagreements, then present your recommendation.
