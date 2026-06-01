# Lun — Multi-agent Consultation Rule

When facing architecture decisions, design trade-offs, or implementation strategy choices, consult other AI agents using `lun` before committing to an approach.

## When to use

- Choosing between competing approaches (REST vs GraphQL, monorepo vs polyrepo, etc.)
- Reviewing architecture or system design
- Evaluating trade-offs where multiple valid options exist
- When the user asks for "other opinions" or a "second opinion"

## How to use

```bash
# Ask every configured agent (streamed NDJSON)
lun -j "your question here"

# Pick specific providers
lun -j -P kiro,claude,copilot "your question"

# Pick specific models for deeper analysis
lun -j -M claude:opus,copilot:gpt-5.4 "your question"

# Include file context
cat relevant-file.md | lun -j "review this design"

# Add a synthesized recommendation across all answers
lun -j -s "your question"
```

## Output format

`-j` streams **NDJSON — one JSON object per line** (not a single object). Read it line by line:

```jsonl
{"event":"start","providers":["kiro","claude","copilot"]}
{"event":"result","provider":"claude","model":"opus","text":"...","elapsed":3.8,"error":false}
{"event":"result","provider":"kiro","model":"glm-5","text":"...","elapsed":5.2,"error":false}
{"event":"done","total":3,"errors":0}
```

Each `result` event is one agent's full answer. Results arrive as each agent finishes.

## Models (examples — run `lun --list` / `lun -l` for what's installed)

| Provider | Common models |
|----------|---------------|
| kiro | `auto`, `glm-5` |
| claude | `sonnet` (default), `opus`, `haiku` |
| copilot | `auto`, `gpt-5.4`, `claude-sonnet-4.6`, `claude-haiku-4.5` |
| codex | `gpt-5.4` (default), `gpt-5.5`, `gpt-5.3-codex` |
| agy | `auto` |

## After receiving results

1. Read each `result` event's `text`.
2. Identify consensus points and disagreements.
3. Present a short summary to the user with your recommendation.
4. Cite which agents agreed/disagreed on key points.
