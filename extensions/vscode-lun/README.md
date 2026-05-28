# Lun VS Code Extension

Use the local Lun daemon directly inside VS Code.

## Run in development

1. Open this folder in VS Code:

   ```sh
   code extensions/vscode-lun
   ```

2. Press `F5` and choose `Run Lun Extension`.
3. In the Extension Development Host, run `Lun: Open Panel` from the Command Palette.

The extension talks to `http://127.0.0.1:3456` by default. If the daemon is not running and `lun.autoStartDaemon` is enabled, it starts it automatically.

## Commands

- `Lun: Open Panel` opens the daemon dashboard inside VS Code.
- `Lun: Ask About Selection` sends the selected code plus your question.
- `Lun: Review Current File` asks Lun agents to review the active file.
- `Lun: Explain Diagnostics` sends current VS Code diagnostics for explanation.
- `Lun: Start Daemon`, `Lun: Stop Daemon`, and `Lun: Show Status` manage the daemon.

## VS Code Chat

When VS Code Chat or Copilot Chat is available, Lun registers as `@lun`.

```txt
@lun ask about this workspace
@lun /review
@lun /diagnostics
@lun /status
@lun /workers
```

The dashboard remains available through `Lun: Open Panel`; chat requests are routed through the local daemon.
Chat requests stream visible progress updates such as PM planning, agent calls, and agent completion before the final response.

## Settings

- `lun.daemonUrl`: daemon URL, default `http://127.0.0.1:3456`.
- `lun.autoStartDaemon`: start the daemon on demand.
- `lun.executablePath`: optional path to the `lun` executable.
- `lun.defaultMode`: `chat` or `ask`.
- `lun.defaultAgents`: agents used by default. Leave empty to use the daemon configuration.
