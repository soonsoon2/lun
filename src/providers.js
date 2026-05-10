/**
 * Provider definitions — each AI agent CLI interface.
 * To add a new provider, add an entry here.
 */
import { spawnSync } from "child_process";

export const PROVIDERS = {
  kiro: {
    name: "Kiro",
    bin: "kiro-cli",
    defaultModel: "auto",
    installHint: "https://kiro.dev/docs/cli",
    buildArgs: (prompt, model, opts = {}) => {
      const args = ["chat", "--no-interactive", "--wrap", "never", "--trust-all-tools"];
      if (model && model !== "auto") args.push("--model", model);
      if (opts.agent) args.push("--agent", opts.agent);
      if (opts.sessionId) args.push("--resume-id", opts.sessionId);
      args.push(prompt);
      return args;
    },
    env: { TERM: "dumb", NO_COLOR: "1" },
    getModels: () => {
      try {
        const r = spawnSync("kiro-cli", ["chat", "--list-models", "--format", "json"], { encoding: "utf-8", timeout: 10000 });
        if (r.stdout) {
          const data = JSON.parse(r.stdout);
          return (data.models || []).map(m => ({ id: m.model_id, label: m.model_id }));
        }
      } catch {}
      return [{ id: "auto", label: "auto" }];
    },
  },

  claude: {
    name: "Claude Code",
    bin: "claude",
    defaultModel: "sonnet",
    installHint: "npm i -g @anthropic-ai/claude-code",
    buildArgs: (prompt, model, opts = {}) => {
      const args = ["-p", prompt, "--model", model || "sonnet"];
      if (opts.sessionId) args.push("--resume", opts.sessionId);
      return args;
    },
    env: { TERM: "dumb", NO_COLOR: "1" },
    getModels: () => [
      { id: "sonnet", label: "sonnet (default)" },
      { id: "opus", label: "opus (highest quality)" },
      { id: "haiku", label: "haiku (fast, low cost)" },
    ],
  },

  copilot: {
    name: "GitHub Copilot",
    bin: "copilot",
    defaultModel: "auto",
    installHint: "gh extension install github/gh-copilot",
    buildArgs: (prompt, model, opts = {}) => {
      const args = ["-p", prompt, "-s"];
      if (model && model !== "auto") args.push("--model", model);
      if (opts.sessionId) args.push("--resume=" + opts.sessionId);
      return args;
    },
    env: { TERM: "dumb", NO_COLOR: "1" },
    getModels: () => [
      { id: "auto", label: "auto (default)" },
      { id: "gpt-5.2", label: "gpt-5.2" },
      { id: "gpt-4.1", label: "gpt-4.1" },
      { id: "o3", label: "o3 (reasoning)" },
      { id: "claude-sonnet-4.6", label: "claude-sonnet-4.6" },
    ],
  },
};

export function checkAvailable(providerId) {
  const def = PROVIDERS[providerId];
  if (!def) return false;
  const r = spawnSync("which", [def.bin], { encoding: "utf-8" });
  return r.status === 0;
}

export function getAvailableProviders() {
  return Object.keys(PROVIDERS).filter(checkAvailable);
}
