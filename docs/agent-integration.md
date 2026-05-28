# Agent Integration

How to make your AI coding agents use lun for multi-agent consultation.

## Quick Setup

Run this in any project:

```bash
lun --setup-rules
```

This installs rule files for each agent:

| Agent | Rule File |
|-------|-----------|
| Claude Code | `CLAUDE.md` |
| Kiro | `.kiro/steering/lun.md` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Antigravity | `.antigravity/AGENTS.md` |
| Codex/OpenAI | `AGENTS.md` |

## Manual Setup

If you prefer to add rules manually, tell your agent:

```
When making architecture or design decisions, use lun to get other AI opinions:

lun -j -M kiro:claude-sonnet-4.6,claude:opus,copilot:gpt-4.1 "your question"

Parse the NDJSON output and summarize the consensus.
```

## How Agents Use Lun

### 1. Agent detects a design decision

The agent recognizes it's about to make a significant choice (architecture, tech stack, API design).

### 2. Agent calls lun

```bash
lun -j "Should we use WebSocket or SSE for real-time updates? Context: Node.js backend, React frontend, ~1000 concurrent users"
```

### 3. Agent reads streaming results

```jsonl
{"event":"start","providers":["kiro","claude","copilot"]}
{"event":"result","provider":"claude","model":"sonnet","text":"SSE is simpler...","elapsed":3.8,"error":false}
{"event":"result","provider":"kiro","model":"auto","text":"WebSocket for bidirectional...","elapsed":5.2,"error":false}
{"event":"result","provider":"copilot","model":"auto","text":"SSE unless you need...","elapsed":8.1,"error":false}
{"event":"done","total":3,"errors":0}
```

### 4. Agent synthesizes and reports

The agent reads all results, identifies consensus/disagreements, and presents a recommendation to the user.

## Example: Claude Code with Lun

Add to your project's `CLAUDE.md`:

```markdown
## Multi-agent Consultation

For significant design decisions, consult other agents:

\`\`\`bash
lun -j -M claude:opus,copilot:gpt-4.1 "question with context"
\`\`\`

After receiving results:
1. Parse each agent's response
2. Identify where they agree and disagree
3. Present a summary with your recommendation
4. Cite which agents supported which approach
\`\`\`

## Example: Kiro with Lun

Add `.kiro/steering/lun.md`:

```markdown
---
inclusion: manual
---

# Lun Consultation

Use `lun -j "question"` for multi-agent opinions on design decisions.
Parse JSON results and summarize consensus.
```

## Parsing NDJSON in Code

If you're building tooling around lun:

```javascript
import { execSync } from "child_process";

const output = execSync('lun -j "your question"', { encoding: "utf-8" });
const events = output.trim().split("\n").map(JSON.parse);
const results = events.filter(e => e.event === "result");

for (const r of results) {
  console.log(`${r.provider}: ${r.text.slice(0, 100)}...`);
}
```

## Best Practices

- **Include context** — The more specific the question, the better the answers
- **Use appropriate models** — `opus` for important decisions, `sonnet`/`auto` for quick checks
- **Don't over-use** — Reserve for genuine decision points, not routine coding
- **Trust consensus** — If 2+ agents agree, that's a strong signal
- **Question outliers** — A unique perspective might be the most valuable one
