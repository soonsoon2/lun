/**
 * Estimated cost model for Lun usage.
 *
 * IMPORTANT: These are *rough estimates* for the local dashboard only.
 * Lun talks to agent CLIs, not raw model APIs, so we do not get exact token
 * counts or billing back. We estimate tokens from character counts
 * (~4 chars/token heuristic) and multiply by published per-million prices.
 *
 * Prices are USD per 1M tokens: [inputPerM, outputPerM].
 * Unknown models fall back to DEFAULT_RATE. Keep this table easy to edit.
 */

const CHARS_PER_TOKEN = 4;

// USD per 1M tokens [input, output]
const RATES = {
  // Anthropic (Claude Code)
  "opus": [5.5, 27.5],
  "sonnet": [3.3, 16.5],
  "sonnet[1m]": [3.3, 16.5],
  "opus[1m]": [5.5, 27.5],
  "haiku": [1.1, 5.5],
  "claude-haiku-4.5": [1.1, 5.5],
  "claude-sonnet-4.5": [3.3, 16.5],
  "claude-sonnet-4.6": [3.3, 16.5],

  // OpenAI / Codex / Copilot GPT
  "gpt-5.4": [2.5, 15.0],
  "gpt-5.4-mini": [0.75, 4.5],
  "gpt-5-mini": [0.25, 2.0],
  "gpt-4.1": [2.0, 8.0],
  "gpt-4.1-nano": [0.1, 0.4],
  "gpt-5.4-nano": [0.2, 1.25],
  "gpt-5.5": [2.5, 15.0],
  "gpt-5.3-codex": [2.5, 15.0],
  "gpt-5.2-codex": [2.5, 15.0],

  // Kiro / GLM
  "glm-5": [0.6, 2.2],
  "glm-4.7-flash": [0.06, 0.4],

  // misc
  "deepseek-v3.2": [0.62, 1.85],
};

const DEFAULT_RATE = [1.0, 4.0];

function rateFor(model) {
  if (!model) return DEFAULT_RATE;
  const key = String(model).toLowerCase();
  return RATES[key] || RATES[model] || DEFAULT_RATE;
}

/**
 * Estimate USD cost for one run given input/output character counts.
 */
export function estimateCost(model, inputChars = 0, outputChars = 0) {
  const [inRate, outRate] = rateFor(model);
  const inTokens = (inputChars || 0) / CHARS_PER_TOKEN;
  const outTokens = (outputChars || 0) / CHARS_PER_TOKEN;
  const cost = (inTokens * inRate + outTokens * outRate) / 1_000_000;
  return cost;
}

export function isKnownModel(model) {
  if (!model) return false;
  const key = String(model).toLowerCase();
  return !!(RATES[key] || RATES[model]);
}

export { CHARS_PER_TOKEN, RATES, DEFAULT_RATE };
