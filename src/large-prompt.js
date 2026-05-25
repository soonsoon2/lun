/**
 * Large prompt handling — when prompt exceeds CLI argv limits or model windows,
 * write to a temporary file and replace prompt with a "read this file" instruction.
 */
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

// Threshold: above this, we offload to a file.
// Most shells handle ~100K bytes safely; we're conservative.
const PROMPT_THRESHOLD = 4000;

const LUN_TMP = join(tmpdir(), "lun-prompts");

export function ensureTmpDir() {
  if (!existsSync(LUN_TMP)) mkdirSync(LUN_TMP, { recursive: true });
}

/**
 * If prompt is too long, save it to a temp file and return a wrapper prompt
 * that asks the agent to read the file.
 *
 * @param {string} prompt - User's original prompt
 * @param {object} options
 * @param {string} options.userInstruction - Short instruction (e.g., "Review this code")
 * @returns {{ prompt: string, filePath: string|null, offloaded: boolean }}
 */
export function handleLargePrompt(prompt, options = {}) {
  if (!prompt || prompt.length <= PROMPT_THRESHOLD) {
    return { prompt, filePath: null, offloaded: false };
  }

  ensureTmpDir();
  const id = randomUUID().slice(0, 8);
  const filePath = join(LUN_TMP, `prompt-${id}.md`);
  writeFileSync(filePath, prompt, "utf-8");

  // Try to extract a brief instruction from the start of the prompt
  const firstLine = prompt.split("\n").find(l => l.trim().length > 0)?.trim().slice(0, 200) || "the content";
  const instruction = options.userInstruction || `Please read the file at ${filePath} and respond based on its contents. The file contains: ${firstLine}...`;

  const wrapper = `${instruction}

The full content is in: ${filePath}

Please open and read this file, then provide your analysis or answer.`;

  return { prompt: wrapper, filePath, offloaded: true };
}
