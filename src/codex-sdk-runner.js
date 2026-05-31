/**
 * Codex SDK runner — uses @openai/codex-sdk for persistent thread reuse.
 *
 * Why this exists:
 *   `codex exec` spawns a fresh process every call (~5s cold-start floor).
 *   The SDK keeps one CLI process alive and exchanges JSONL events over
 *   stdin/stdout, so subsequent turns drop to ~3-4s.
 *
 * Public API:
 *   runCodexSDK(prompt, { sessionKey, model, cwd, timeout, onChunk })
 *     → { text, elapsed, sessionId, provider, usage }
 *   resetCodexThread(sessionKey)
 *   shutdownCodexSDK()
 */
import { Codex } from "@openai/codex-sdk";
import { getWorkDir } from "./config.js";

// One Codex client per process; threads are keyed by caller-provided sessionKey.
const codex = new Codex();
const threads = new Map(); // sessionKey → { thread, model, cwd, runs, lastUsedAt }

function getOrCreateThread(sessionKey, opts) {
  const existing = threads.get(sessionKey);
  if (existing && existing.model === opts.model && existing.cwd === opts.cwd) {
    return existing.thread;
  }
  // If config differs, drop old thread (process is reused via Codex client)
  const thread = codex.startThread({
    workingDirectory: opts.cwd,
    skipGitRepoCheck: true,
    sandboxMode: "workspace-write",
    approvalPolicy: "never",
    model: opts.model,
  });
  threads.set(sessionKey, { thread, model: opts.model, cwd: opts.cwd, runs: 0, lastUsedAt: null });
  return thread;
}

export async function runCodexSDK(prompt, options = {}) {
  const {
    sessionKey = "default",
    model,
    cwd = getWorkDir(),
    timeout = 120000,
    onChunk,
  } = options;

  const thread = getOrCreateThread(sessionKey, { model, cwd });
  const startTime = Date.now();

  // Set up an AbortController for the timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    if (onChunk) {
      // Streaming path
      const { events } = await thread.runStreamed(prompt, { signal: controller.signal });
      let finalText = "";
      let usage = null;
      for await (const event of events) {
        if (event.type === "item.completed" && event.item?.type === "agent_message") {
          finalText = event.item.text || finalText;
          if (onChunk) onChunk("codex", event.item.text);
        } else if (event.type === "item.updated" && event.item?.type === "agent_message") {
          if (onChunk && event.item.text) onChunk("codex", event.item.text);
        } else if (event.type === "turn.completed") {
          usage = event.usage || null;
        } else if (event.type === "turn.failed") {
          throw new Error(event.error?.message || "codex turn failed");
        }
      }
      clearTimeout(timer);
      const state = threads.get(sessionKey);
      if (state) {
        state.runs += 1;
        state.lastUsedAt = Date.now();
      }
      return {
        text: finalText.trim(),
        elapsed: parseFloat(((Date.now() - startTime) / 1000).toFixed(1)),
        sessionId: thread.id || sessionKey,
        provider: "codex",
        usage,
      };
    }

    // Buffered path
    const turn = await thread.run(prompt, { signal: controller.signal });
    clearTimeout(timer);
    const state = threads.get(sessionKey);
    if (state) {
      state.runs += 1;
      state.lastUsedAt = Date.now();
    }
    return {
      text: (turn.finalResponse || "").trim(),
      elapsed: parseFloat(((Date.now() - startTime) / 1000).toFixed(1)),
      sessionId: thread.id || sessionKey,
      provider: "codex",
      usage: turn.usage || null,
    };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new Error(`timeout (${timeout / 1000}s)`);
    }
    throw err;
  }
}

export function resetCodexThread(sessionKey = "default") {
  threads.delete(sessionKey);
}

export function getCodexSDKStatuses() {
  if (!threads.size) {
    return [{
      provider: "codex",
      alive: true,
      ready: true,
      persistent: true,
      protocol: "codex-sdk",
      queued: 0,
      busy: false,
      runs: 0,
      lastError: null,
      note: "managed by Codex SDK thread cache; first thread starts on first request",
    }];
  }

  return [...threads.entries()].map(([sessionKey, state]) => ({
    provider: "codex",
    model: state.model,
    cwd: state.cwd,
    alive: true,
    ready: true,
    persistent: true,
    protocol: "codex-sdk",
    sessionId: state.thread?.id || sessionKey,
    sessionKey,
    queued: 0,
    busy: false,
    runs: state.runs,
    lastError: null,
    lastUsedAt: state.lastUsedAt,
    note: "persistent Codex SDK thread cache",
  }));
}

export function prewarmCodexSDK(options = {}) {
  const {
    sessionKey = "default",
    model,
    cwd = getWorkDir(),
  } = options;
  getOrCreateThread(sessionKey, { model, cwd });
  return getCodexSDKStatuses().find(status => status.sessionKey === sessionKey) || null;
}

export function shutdownCodexSDK() {
  threads.clear();
}
