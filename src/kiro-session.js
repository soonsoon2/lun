/**
 * Kiro session-file parsing.
 *
 * Kiro CLI persists each conversation as a JSONL file under
 * ~/.kiro/sessions/cli. The web/daemon server reads these to recover the
 * structured response (assistant text + tool uses) for a prompt, since
 * kiro's stdout in --no-interactive mode is not machine-friendly.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join } from "path";

export const KIRO_SESSIONS_DIR = join(process.env.HOME, ".kiro/sessions/cli");

/**
 * Find the kiro session id whose latest Prompt matches `promptText`,
 * among sessions modified at/after `startedAtMs` (with a small grace window).
 */
export function findSessionForPrompt(promptText, startedAtMs, sessionsDir = KIRO_SESSIONS_DIR) {
  try {
    const files = readdirSync(sessionsDir)
      .filter(f => f.endsWith(".jsonl"))
      .map(f => {
        const path = join(sessionsDir, f);
        const stat = statSync(path);
        return { path, mtime: stat.mtimeMs, id: f.replace(".jsonl", "") };
      })
      .filter(f => f.mtime >= startedAtMs - 5000)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 12);

    for (const file of files) {
      const lines = readFileSync(file.path, "utf-8").trim().split("\n").filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(lines[i]);
          if (entry.kind !== "Prompt") continue;
          const text = (entry.data?.content || [])
            .filter(part => part.kind === "text")
            .map(part => part.data || "")
            .join("\n")
            .trim();
          if (text === promptText.trim()) return file.id;
          break;
        } catch {}
      }
    }
  } catch { return null; }
  return null;
}

/** Parse the last turn (assistant text + tools) from a kiro session file. */
export function parseLastTurn(sessionId, sessionsDir = KIRO_SESSIONS_DIR) {
  const jsonlPath = join(sessionsDir, `${sessionId}.jsonl`);
  if (!existsSync(jsonlPath)) return null;

  const content = readFileSync(jsonlPath, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);

  // Find the last Prompt and collect everything after it
  let lastPromptIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(lines[i]);
      if (obj.kind === "Prompt") { lastPromptIdx = i; break; }
    } catch {}
  }

  if (lastPromptIdx === -1) return null;

  const turn = [];
  for (let i = lastPromptIdx + 1; i < lines.length; i++) {
    try {
      turn.push(JSON.parse(lines[i]));
    } catch {}
  }

  return formatTurn(turn);
}

/** Convert raw turn entries into structured messages for the client. */
export function formatTurn(entries) {
  const result = { tools: [], text: "" };

  for (const entry of entries) {
    if (entry.kind === "AssistantMessage") {
      for (const part of entry.data.content) {
        if (part.kind === "text" && part.data) {
          result.text += part.data + "\n";
        } else if (part.kind === "toolUse") {
          const tool = part.data;
          result.tools.push({
            id: tool.toolUseId,
            name: tool.name,
            purpose: tool.input?.__tool_use_purpose || tool.input?.label || tool.name,
            input: tool.input || {},
            result: null,
          });
        }
      }
    } else if (entry.kind === "ToolResults") {
      for (const c of entry.data.content) {
        if (c.kind === "toolResult") {
          const toolId = c.data.toolUseId;
          const existing = result.tools.find(t => t.id === toolId);
          if (existing) {
            existing.result = summarizeToolResult(c.data.content);
          }
        }
      }
    }
  }

  result.text = result.text.trim();
  return result;
}

/** Summarize a tool result payload into compact, client-friendly parts. */
export function summarizeToolResult(content) {
  const parts = [];
  for (const item of content) {
    if (item.kind === "text") {
      parts.push({ type: "text", data: item.data.slice(0, 2000) });
    } else if (item.kind === "json") {
      const d = item.data;
      if (d.exit_status !== undefined) {
        parts.push({ type: "cmd", exitCode: d.exit_status, stdout: (d.stdout || "").slice(0, 500) });
      } else if (d.results) {
        parts.push({ type: "search", count: d.results.length, results: d.results.slice(0, 5).map(r => ({ title: r.title, url: r.url })) });
      } else if (d.content) {
        parts.push({ type: "fetch", content: (d.content || "").slice(0, 300) });
      } else {
        parts.push({ type: "json", data: JSON.stringify(d).slice(0, 500) });
      }
    }
  }
  return parts;
}
