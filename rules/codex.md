# Lun — Multi-agent Consultation

When facing architecture decisions or design trade-offs, use `lun` to consult other AI coding agents.

## When to use

- Design decisions with multiple valid approaches
- Architecture review
- User requests "other opinions" or "second opinion"

## Commands

```bash
# All agents
lun -j "question"

# Specific models
lun -j -M kiro:claude-sonnet-4.6,claude:opus,copilot:gpt-4.1 "question"

# File context
cat file.md | lun -j "review"

# With synthesis
lun -j -s "question"
```

## Models

- kiro: auto, claude-opus-4.6, claude-sonnet-4.6, claude-haiku-4.5, deepseek-3.2
- claude: sonnet (default), opus, haiku
- copilot: auto (default), gpt-5.2, gpt-4.1, o3

## Output format (--json)

```json
{
  "prompt": "...",
  "results": [
    { "provider": "kiro", "model": "auto", "text": "...", "elapsed": 4.2 },
    { "provider": "claude", "model": "opus", "text": "...", "elapsed": 3.8 }
  ]
}
```

## After results

Parse results, identify consensus/disagreements, present summary with recommendation.
