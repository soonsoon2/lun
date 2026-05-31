# Changelog

## [Unreleased]

### Added
- **LICENSE** file (MIT) — previously declared but missing.
- **Open-source governance**: `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, GitHub issue/PR templates.
- **Tests**: `test/` suite using Node's built-in test runner (`npm test`),
  covering provider definitions, output cleaning, and cost estimation.
- **CI**: GitHub Actions workflow running `check` + `test` on Node 18/20/22.
- **`lun.soonsoon.io`** landing page.

### Changed
- Install path is now GitHub-based: `npm install -g github:soonsoon2/lun`.
- `package.json` gained `repository`, `bugs`, `homepage`, `author`, and a
  `test` script.

### Security
- Documented the security model in `SECURITY.md`: auto-approved agent tool use
  and the unauthenticated localhost server.

## [1.6.0] — 2026-05-10

### Added
- **`lun chat`** — Lun Agent (PM-style conversational agent)
  - Inspired by SCA (Soonsoon Custom Agent) architecture
  - Uses an installed CLI agent as the LLM backend (instead of SAM API)
  - PM agent orchestrates other CLI agents as "tools"
  - Tool call format: `<call agent="name">prompt</call>`
  - Supports `<call agent="all">` for parallel multi-agent queries
  - Maintains conversation history, saves session
- **PM Agent selection in `--init`** — choose which agent acts as PM
- **`config.pmAgent`** — persisted PM preference
- **`lun --setup-rules`** earlier; web UI streaming, split view, agent chips, mode switch

### Architecture
- `src/lun-agent.js` — Lun Agent core (chatTurn function)
- PM agent sees system prompt with available specialists
- Tool results fed back into PM for synthesis
- Max 3 tool rounds per turn

## [1.5.0] — 2026-05-10

UI/UX overhaul: split view, progress bar, streaming, agent chips, moderator messages.

## [1.4.0] — 2026-05-10

### Added
- **Moderator agent** — configurable agent that synthesizes all answers
- **Discussion mode** (`--discuss` / `-d`) — autonomous multi-turn debate
  - Agents answer → moderator synthesizes → generates follow-up → repeat
  - `--max-turns <n>` — limit rounds (default: 3)
  - `--max-time <sec>` — time limit (default: 120s)
- **Moderator selection in `--init`** — choose which agent leads synthesis
- **`config.moderator`** — persisted moderator preference
- **`config.autoDiscuss`** — default discuss settings (maxTurns, maxTime)
- **Synthesis uses dedicated prompt** — better structured output with consensus/conflicts/recommendation

### Changed
- `--summarize` now uses the configured moderator (not hardcoded to claude)
- Synthesis prompt improved: includes moderator's own opinion + actionable recommendation

## [1.3.0] — 2026-05-10

### Added
- **Web UI moderator integration** — web chat now uses smart routing (search → capable agents only)
- **System messages in web UI** — shows routing decisions and skip notifications
- **Session API** (`GET /api/sessions`) — web UI loads sessions from `~/.lun/sessions/`
- **Unified session storage** — both CLI and Web save to the same `~/.lun/sessions/` directory
- **Auto-save on web** — every web conversation auto-saved as .md + .json

### Changed
- Web UI session list now reads from `~/.lun/sessions/` (shared with CLI)
- Web "all" mode replaced with moderator-driven routing
- Removed legacy `_data/threads/` dependency for new sessions

## [1.2.0] — 2026-05-10

### Added
- **Moderator agent** — analyzes user intent and routes to capable agents
- **Capabilities matrix** (`src/capabilities.js`) — defines what each agent can/cannot do
- **Intent detection** — auto-detects search, code review, comparison, reasoning queries
- **Smart routing** — search queries only go to search-capable agents (kiro, codex)
- **Skip notifications** — tells you when agents are skipped and why
- **NDJSON now includes intent/strategy** in `start` event

### Architecture
- `src/moderator.js` — orchestration brain (intent detection + routing + execution)
- `src/capabilities.js` — per-agent capability definitions (extensible)
- Both CLI and Web use the same moderator logic

## [1.1.0] — 2026-05-10

### Added
- **Streaming output** — results appear as each agent finishes (no more waiting for slowest)
- **NDJSON streaming** (`--json`) — emits `start`, `chunk`, `result`, `done` events line-by-line
- **Real-time chunks** — `onChunk` callback streams partial output as agents generate
- **`--setup-rules`** — auto-install lun consultation rules into any project
- **Agent rule templates** — pre-built rules for Claude, Kiro, Copilot, Antigravity, Codex (`rules/`)
- **Session auto-save** — every query (one-shot or interactive) saved to `~/.lun/sessions/`

### Changed
- Human mode now prints each agent's response immediately when ready (race pattern)
- JSON mode switched from single JSON blob to NDJSON streaming
- Calling agent can start processing first result without waiting for all

### Fixed
- `selectFromList` redraw bug (duplicate rendering)
- Unavailable agents now auto-skipped with warning instead of error

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
