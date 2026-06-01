# Contributing to Lun

First off — thank you. Lun (論) is about many minds reaching better answers, and
that applies to the project itself. Forks, variants, bug reports, and pull
requests are all welcome.

## Ways to contribute

- **Report a bug** — open an issue with steps to reproduce.
- **Add a provider** — wire up a new AI agent CLI (see below).
- **Improve docs** — README, `docs/`, examples.
- **Fix or refactor** — smaller, focused PRs are easier to review.

## Development setup

```bash
git clone https://github.com/soonsoon2/lun.git
cd lun
npm install
node bin/lun.js --help     # run the CLI from source
npm run check              # syntax-check entry points
npm test                   # run the test suite
```

Requirements:

- Node.js >= 18
- At least one AI agent CLI installed and authenticated (Claude Code, Copilot,
  Kiro, Antigravity, or Codex) if you want to test real runs.

## Adding a provider

The provider registry lives in [`src/providers.js`](src/providers.js). A minimal
provider is a single object:

```js
myagent: {
  name: "My Agent",
  bin: "myagent-cli",
  defaultModel: "default",
  installHint: "npm i -g myagent",
  buildArgs: (prompt, model, opts) => ["-p", prompt, "--model", model],
  env: { TERM: "dumb", NO_COLOR: "1" },
  getModels: () => [{ id: "default", label: "default" }],
},
```

For a **fully integrated** provider you may also need to touch:

- `src/capabilities.js` and `src/skills.js` — routing metadata used by the PM
  and moderator modes.
- `src/runner.js` + a worker file (`src/agent-workers.js`, `src/acp-worker.js`,
  etc.) — only if the agent supports a warm daemon protocol.

Keep the basic case simple: if you just want the provider available for `lun`
one-shot/REPL, the `providers.js` entry alone is enough.

### Security note for providers

Lun spawns agent CLIs with **array arguments** (never `shell: true`) — please
keep it that way. Never interpolate user input into a shell string. The prompt
must always be passed as a single argv element.

## Pull request guidelines

- Branch off `main`, open the PR against `main`.
- Keep PRs focused — one logical change per PR.
- Run `npm run check` and `npm test` before pushing.
- Update `CHANGELOG.md` under an "Unreleased" section if your change is
  user-facing.
- Describe what you changed, why, and how you tested it.

## Code style

- ES modules, `const`/`let`, 2-space indent.
- Match the existing style of the file you're editing.
- Prefer small, readable functions over cleverness.

## Releasing (maintainers)

Releases publish `@soonsoon2/lun` to npm automatically via GitHub Actions
(`.github/workflows/release.yml`) when a `v*` tag is pushed:

```bash
npm version patch    # or minor / major — bumps package.json + makes a git tag
git push --follow-tags
```

The workflow runs `check` + `test`, verifies the tag matches `package.json`,
then publishes. Authentication uses npm **Trusted Publishing (OIDC)** — no
long-lived token is stored. (One-time setup, already done: npmjs.com →
package → Settings → Trusted Publisher → GitHub Actions, repo `soonsoon2/lun`,
workflow `release.yml`.)

To publish manually instead: `npm publish --access public` (requires 2FA OTP).

## Reporting security issues

Please do **not** open a public issue for security vulnerabilities. See
[SECURITY.md](SECURITY.md) for how to report privately.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
