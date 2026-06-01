# Lun — Multi-agent Consultation

When facing architecture decisions or design trade-offs, use `lun` to get opinions from other AI agents before committing.

## When to use

- Architecture or design decisions with multiple valid approaches
- Trade-off evaluation
- When the user requests "other opinions"

## Commands

```bash
# Ask every configured agent (streamed NDJSON)
lun -j "your question"

# Specific providers
lun -j -P kiro,claude,copilot,agy,codex "question"

# Pipe a file as context
cat file.md | lun -j "review this"

# Add a synthesized recommendation
lun -j -s "question"
```

## Output format

`-j` streams **NDJSON — one JSON object per line**:

```jsonl
{"event":"start","providers":["kiro","claude","copilot","agy","codex"]}
{"event":"result","provider":"agy","model":"auto","text":"...","elapsed":6.8,"error":false}
{"event":"done","total":5,"errors":0}
```

## Providers

- kiro: web search, tool use, file operations
- claude: code review, reasoning, long context
- copilot: GitHub-oriented coding support
- agy: Antigravity agent workflow, search, multimodal / long context
- codex: code execution, image analysis, broad tool use

## After results

Read each `result` line, summarize consensus and disagreements, then present your recommendation.
