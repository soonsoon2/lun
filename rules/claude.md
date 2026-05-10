# Lun — Multi-agent Consultation Rule

When facing architecture decisions, design trade-offs, or implementation strategy choices, consult other AI agents using `lun` before proceeding.

## When to use

- Choosing between competing approaches (REST vs GraphQL, monorepo vs polyrepo, etc.)
- Reviewing architecture or system design
- Evaluating trade-offs where multiple valid options exist
- When the user asks for "other opinions" or "second opinion"

## How to use

```bash
# Basic query — all agents respond
lun -j "your question here"

# With specific models for deeper analysis
lun -j -M kiro:claude-sonnet-4.6,claude:opus,copilot:gpt-4.1 "your question"

# Include file context
cat relevant-file.md | lun -j "review this design"

# With synthesis (auto-summarize all answers)
lun -j -s "your question"
```

## Available models

| Provider | Models |
|----------|--------|
| kiro | auto, claude-opus-4.6, claude-sonnet-4.6, claude-haiku-4.5, deepseek-3.2 |
| claude | sonnet (default), opus, haiku |
| copilot | auto (default), gpt-5.2, gpt-4.1, o3, claude-sonnet-4.6 |

## Output format

The `-j` flag returns JSON:
```json
{
  "prompt": "...",
  "results": [
    { "provider": "kiro", "model": "auto", "text": "...", "elapsed": 4.2 },
    { "provider": "claude", "model": "opus", "text": "...", "elapsed": 3.8 },
    { "provider": "copilot", "model": "auto", "text": "...", "elapsed": 5.1 }
  ]
}
```

## After receiving results

1. Read each agent's response
2. Identify consensus points and disagreements
3. Present a summary to the user with your recommendation
4. Cite which agents agreed/disagreed on key points
