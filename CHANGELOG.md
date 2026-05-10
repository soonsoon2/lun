# Changelog

## [1.0.0] — 2026-05-09

### Added
- Multi-agent parallel execution (Kiro, Claude Code, GitHub Copilot)
- Interactive REPL mode (`lun` with no arguments)
- One-shot mode (`lun "prompt"`)
- Pipe support (`cat file | lun "review"`)
- JSON output for agent integration (`--json`)
- Synthesis mode — summarize all answers (`--summarize`)
- Per-provider model selection (`--models claude:opus,copilot:gpt-4.1`)
- Session persistence — auto-save to `~/.lun/sessions/` as `.md` and `.json`
- Interactive setup wizard (`--init`) with arrow-key selection
- i18n support (English, Korean, Japanese)
- Web UI with group-chat style interface (`node server.js`)
- Progress display with per-agent status
- Auto-skip unavailable agents with install hints
- Session history viewer (`--sessions`)
- Configuration management (`--config`)

### Architecture
- `src/providers.js` — Provider definitions (extensible)
- `src/runner.js` — Spawn engine with timeout and ANSI cleanup
- `src/config.js` — Config management (~/.lun/)
- `src/session.js` — Session persistence (.md + .json)
- `src/i18n.js` — Internationalization
- `src/ui.js` — Terminal UI components
- `bin/lun.js` — CLI entry point
- `server.js` — Web server (Fastify + WebSocket)
