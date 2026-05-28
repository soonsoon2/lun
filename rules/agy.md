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

# With specific providers
lun -j -P kiro,claude,copilot,agy,codex "question"

# Pipe file as context
cat file.md | lun -j "review this"

# Auto-synthesize
lun -j -s "question"
```

## Providers

- kiro: web search, tool use, file operations
- claude: code review, reasoning, long context
- copilot: GitHub-oriented coding support
- agy: Antigravity agent workflow, search, multimodal/long-context support
- codex: code execution, image analysis, broad tool use

## Output

JSON with `results` array containing each agent's `provider`, `model`, `text`, `elapsed`.

## After results

Summarize consensus and disagreements, then present your recommendation.
