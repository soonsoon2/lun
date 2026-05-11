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
          return [...(data.models || []).map(m => ({ id: m.model_id, label: m.model_id })), { id: "__custom__", label: "Other (type manually)" }];
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
      { id: "sonnet[1m]", label: "sonnet [1M context]" },
      { id: "opus[1m]", label: "opus [1M context]" },
      { id: "__custom__", label: "Other (type manually)" },
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
      { id: "auto", label: "Auto" },
      { id: "gpt-5.4", label: "GPT-5.4 (default) — 1x" },
      { id: "gpt-5.3-codex", label: "GPT-5.3-Codex — 1x" },
      { id: "gpt-5.2-codex", label: "GPT-5.2-Codex — 1x" },
      { id: "gpt-5.2", label: "GPT-5.2 — 1x" },
      { id: "gpt-5.4-mini", label: "GPT-5.4 mini — 0.33x" },
      { id: "gpt-5-mini", label: "GPT-5 mini — 0x" },
      { id: "gpt-4.1", label: "GPT-4.1 — 0x" },
      { id: "claude-sonnet-4.6", label: "Claude Sonnet 4.6 — 1x" },
      { id: "claude-sonnet-4.5", label: "Claude Sonnet 4.5 — 1x" },
      { id: "claude-haiku-4.5", label: "Claude Haiku 4.5 — 0.33x" },
      { id: "__custom__", label: "Other (type manually)" },
    ],
  },

  gemini: {
    name: "Gemini CLI",
    bin: "gemini",
    defaultModel: "gemini-2.5-flash",
    installHint: "npm i -g @google/gemini-cli",
    buildArgs: (prompt, model, opts = {}) => {
      const args = ["-p", prompt, "-y"];
      if (model && model !== "auto") args.push("-m", model);
      return args;
    },
    env: { TERM: "dumb", NO_COLOR: "1" },
    getModels: () => [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (default)" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
      { id: "__custom__", label: "Other (type manually)" },
    ],
  },

  codex: {
    name: "Codex CLI",
    bin: "codex",
    defaultModel: "o3",
    installHint: "npm i -g @openai/codex",
    buildArgs: (prompt, model, opts = {}) => {
      const args = ["exec", prompt];
      if (model) args.push("-m", model);
      return args;
    },
    env: { TERM: "dumb", NO_COLOR: "1" },
    getModels: () => [
      { id: "o3", label: "o3 (default)" },
      { id: "o4-mini", label: "o4-mini" },
      { id: "gpt-5.4", label: "GPT-5.4" },
      { id: "__custom__", label: "Other (type manually)" },
    ],
  },

  cline: {
    name: "Cline CLI",
    bin: "cline",
    defaultModel: "auto",
    installHint: "npm i -g @anthropic-ai/cline",
    buildArgs: (prompt, model, opts = {}) => {
      const args = ["-y", prompt];
      if (model && model !== "auto") args.push("--model", model);
      return args;
    },
    env: { TERM: "dumb", NO_COLOR: "1" },
    getModels: () => [
      { id: "auto", label: "Auto (default)" },
      { id: "__custom__", label: "Other (type manually)" },
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
