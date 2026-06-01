# Lun — Multi-agent Consultation

When facing architecture decisions or design trade-offs, use `lun` to consult other AI coding agents before committing.

## When to use

- Design decisions with multiple valid approaches
- Architecture review
- User requests "other opinions" or a "second opinion"

## Commands

```bash
# Ask every configured agent (streamed NDJSON)
lun -j "question"

# Specific providers / models
lun -j -P kiro,claude,copilot "question"
lun -j -M claude:opus,copilot:gpt-5.4 "question"

# File context
cat file.md | lun -j "review"

# Add a synthesized recommendation
lun -j -s "question"
```

## Output format

`-j` streams **NDJSON — one JSON object per line** (not a single object):

```jsonl
{"event":"start","providers":["kiro","claude","copilot"]}
{"event":"result","provider":"kiro","model":"glm-5","text":"...","elapsed":4.2,"error":false}
{"event":"result","provider":"claude","model":"opus","text":"...","elapsed":3.8,"error":false}
{"event":"done","total":3,"errors":0}
```

## Models (run `lun -l` for what's installed)

- kiro: `auto`, `glm-5`
- claude: `sonnet` (default), `opus`, `haiku`
- copilot: `auto`, `gpt-5.4`, `claude-sonnet-4.6`
- codex: `gpt-5.4` (default), `gpt-5.5`, `gpt-5.3-codex`
- agy: `auto`

## After results

Parse each `result` line, identify consensus/disagreements, present a summary with your recommendation.
