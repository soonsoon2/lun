/**
 * Core execution engine — spawns CLI agents and collects results.
 */
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { readFileSync, existsSync } from "fs";
import { PROVIDERS } from "./providers.js";

// ============================================================
// OUTPUT CLEANING
// ============================================================
export function stripAnsi(str) {
  return str
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[\?=>!]?[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1b[()][A-Z012]/g, "")
    .replace(/\x1b[\x20-\x7e]/g, "")
    .replace(/\x1b/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
    .trim();
}

export function cleanOutput(raw) {
  return raw
    .replace(/^Warning:.*$/gm, "")
    .replace(/^All tools are now trusted.*$/gm, "")
    .replace(/^Agents can sometimes.*$/gm, "")
    .replace(/^Learn more at.*$/gm, "")
    .replace(/^YOLO mode.*$/gm, "")
    .replace(/^Ripgrep is not available.*$/gm, "")
    .replace(/^Changes\s+\+\d+\s+-\d+.*$/gm, "")
    .replace(/^Requests\s+\d+.*$/gm, "")
    .replace(/^Tokens\s+.*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ============================================================
// SINGLE PROVIDER EXECUTION
// ============================================================
export function runProvider(providerId, prompt, options = {}) {
  const providerDef = PROVIDERS[providerId];
  if (!providerDef) return Promise.reject(new Error(`Unknown provider: ${providerId}`));

  const { model, sessionId: resumeSessionId, cwd, timeout = 120000, onChunk } = options;

  return new Promise((resolve, reject) => {
    let effectiveSessionId = resumeSessionId || null;

    // Auto-generate session IDs for resume support
    if (providerId === "claude" && !effectiveSessionId) effectiveSessionId = randomUUID();
    if (providerId === "copilot" && !effectiveSessionId) effectiveSessionId = "kc-" + Date.now();

    const args = providerDef.buildArgs(prompt, model, { sessionId: effectiveSessionId, agent: options.agent });

    // Claude first turn: --session-id instead of --resume
    if (providerId === "claude" && !resumeSessionId && effectiveSessionId) {
      const idx = args.indexOf("--resume");
      if (idx !== -1) args.splice(idx, 2);
      args.push("--session-id", effectiveSessionId);
    }

    // Copilot first turn: --name instead of --resume
    if (providerId === "copilot" && !resumeSessionId && effectiveSessionId) {
      const idx = args.findIndex(a => a.startsWith("--resume="));
      if (idx !== -1) args.splice(idx, 1);
      args.push("--name=" + effectiveSessionId);
    }

    const bin = providerDef.bin;
    const env = { ...process.env, ...(providerDef.env || {}) };

    if (providerDef.envFile && existsSync(providerDef.envFile)) {
      const content = readFileSync(providerDef.envFile, "utf-8");
      for (const line of content.split("\n")) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.+?)["']?$/);
        if (m) env[m[1]] = m[2];
      }
    }

    const startTime = Date.now();
    const child = spawn(bin, args, { cwd: cwd || process.env.HOME, env });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      // Stream chunks to callback if provided
      if (onChunk) {
        const cleaned = stripAnsi(text).trim();
        if (cleaned) onChunk(providerId, cleaned);
      }
    });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      const elapsed = parseFloat(((Date.now() - startTime) / 1000).toFixed(1));
      const text = cleanOutput(stripAnsi(`${stdout}\n${stderr}`));

      if (!text && code !== 0) {
        reject(new Error(`${bin} exited with code ${code} (${elapsed}s)`));
      } else {
        resolve({ text, elapsed, sessionId: effectiveSessionId, provider: providerId });
      }
    });

    setTimeout(() => { child.kill(); reject(new Error(`timeout (${timeout / 1000}s)`)); }, timeout);
  });
}

// ============================================================
// PARALLEL EXECUTION
// ============================================================
export async function runAll(prompt, options = {}) {
  const { providers = Object.keys(PROVIDERS), models = {}, cwd, timeout } = options;

  return Promise.all(providers.map(async (pid) => {
    try {
      return await runProvider(pid, prompt, { model: models[pid], cwd, timeout });
    } catch (err) {
      return { text: `[Error] ${err.message}`, elapsed: 0, sessionId: null, provider: pid, error: true };
    }
  }));
}
