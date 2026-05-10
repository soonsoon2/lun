# Available Models

## Kiro

Kiro supports multiple models through its multi-provider backend:

| Model | Description | Best for |
|-------|-------------|----------|
| `auto` | Auto-select by task (default) | General use |
| `claude-opus-4.6` | Claude Opus 4.6 | Complex reasoning |
| `claude-sonnet-4.6` | Claude Sonnet 4.6 (1M context) | Balanced quality/speed |
| `claude-sonnet-4.5` | Claude Sonnet 4.5 | Previous gen |
| `claude-haiku-4.5` | Claude Haiku 4.5 | Fast, low cost |
| `deepseek-3.2` | DeepSeek V3.2 | Code generation |
| `minimax-m2.5` | MiniMax M2.5 | Alternative perspective |
| `qwen3-coder-next` | Qwen3 Coder | Code-focused |

Get the full list:
```bash
kiro-cli chat --list-models
```

## Claude Code

| Model | Description | Best for |
|-------|-------------|----------|
| `sonnet` | Claude Sonnet (default) | Fast, capable, daily use |
| `opus` | Claude Opus | Highest quality reasoning |
| `haiku` | Claude Haiku | Quick checks, low cost |

## GitHub Copilot

| Model | Description | Best for |
|-------|-------------|----------|
| `auto` | Auto-select (default) | General use |
| `gpt-5.2` | GPT-5.2 | Latest OpenAI |
| `gpt-4.1` | GPT-4.1 | Stable, proven |
| `o3` | o3 | Deep reasoning |
| `claude-sonnet-4.6` | Claude via Copilot | Anthropic through GitHub |

## Choosing Models

### For important architecture decisions:
```bash
lun -M claude:opus,copilot:o3,kiro:claude-opus-4.6 "question"
```

### For quick daily checks:
```bash
lun "question"  # uses defaults (sonnet/auto/auto)
```

### For cost-conscious usage:
```bash
lun -M claude:haiku,kiro:claude-haiku-4.5 "question"
```

### For maximum diversity of opinion:
```bash
lun -M kiro:deepseek-3.2,claude:opus,copilot:gpt-5.2 "question"
```
Different underlying models = more diverse perspectives.

## Updating Models

Edit `~/.lun/config.json` or run:
```bash
lun --init
```
