# Security Policy

## Reporting a vulnerability

If you find a security issue, please report it **privately** rather than opening
a public issue:

- Use GitHub's [private vulnerability reporting](https://github.com/soonsoon2/lun/security/advisories/new), or
- Contact the maintainer via the email on the [GitHub profile](https://github.com/soonsoon2).

Please include steps to reproduce and the potential impact. I'll acknowledge
within a reasonable time and work with you on a fix before any public
disclosure.

## Security model — please read

Lun is a **local developer tool**. By design it makes some powerful, trusting
choices that you should understand before exposing it beyond your own machine.

### 1. Lun auto-approves agent tool use

To run non-interactively, Lun launches each agent CLI in a fully-trusting mode
(e.g. `--trust-all-tools`, `--dangerously-skip-permissions`, Codex
`approvalPolicy: "never"`). This means an agent can read and modify files in the
working directory without prompting. This is intentional for a local,
single-user workflow — but it means **whoever can send Lun a prompt can drive
code-executing agents on your machine.**

### 2. The web/daemon server has no authentication

`lun serve` and `lun daemon` start an HTTP/WebSocket server. By default it binds
to `127.0.0.1` (localhost only), which is the safe configuration. **There is no
authentication, token, or CORS protection.**

Do **not**:

- Set `LUN_HOST=0.0.0.0` (or otherwise bind to a public/shared interface)
  unless you fully control the network.
- Put the server behind a reverse proxy that exposes it to others.
- Run it on a shared/multi-user host where others can reach the port.

Doing any of the above would let other clients on the network drive
filesystem-mutating agents in your home directory.

### 3. Lun does not handle your API keys

Lun never stores or transmits provider API keys. Each agent CLI uses its own
authentication. Lun only spawns those CLIs as subprocesses.

### Safe usage checklist

- [ ] Keep the server on `127.0.0.1` (the default).
- [ ] Run Lun in a directory you trust the agents to operate in.
- [ ] Don't expose the port to untrusted networks.

## Supported versions

This is an experimental project; security fixes are applied to the latest
version on `main` only.
