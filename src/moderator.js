/**
 * Moderator — the orchestration brain of Lun.
 *
 * Analyzes user intent, routes to appropriate agents based on capabilities,
 * collects results, and synthesizes a coherent response.
 */
import { CAPABILITIES, getProvidersWithCapability } from "./capabilities.js";
import { PROVIDERS, checkAvailable } from "./providers.js";
import { runProvider } from "./runner.js";

// ============================================================
// INTENT DETECTION
// ============================================================
const INTENT_PATTERNS = {
  search: [
    /최근|latest|recent|현재|current|today|이번 주|this week/i,
    /검색|search|찾아|look up|find out|알아봐/i,
    /뉴스|news|업데이트|update|변경사항|changelog|release/i,
    /what('s| is) (new|happening|trending)/i,
  ],
  codeReview: [
    /리뷰|review|검토|check this|이 코드|this code/i,
    /버그|bug|문제|issue|취약|vulnerab/i,
    /개선|improve|refactor|optimize/i,
  ],
  comparison: [
    /vs\.?|versus|비교|compare|차이|difference|어떤게|which is better/i,
    /장단점|pros.?cons|trade.?off/i,
  ],
  reasoning: [
    /왜|why|어떻게|how should|설계|design|아키텍처|architect/i,
    /전략|strategy|접근|approach|방법|method/i,
  ],
};

/**
 * Detect the primary intent of a user query.
 * Returns: "search" | "codeReview" | "comparison" | "reasoning" | "general"
 */
export function detectIntent(prompt) {
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(prompt)) return intent;
    }
  }
  return "general";
}

// ============================================================
// ROUTING STRATEGY
// ============================================================

/**
 * Determine which providers to use and how, based on intent and capabilities.
 *
 * Returns: {
 *   strategy: "all" | "capable" | "specialized",
 *   providers: string[],
 *   reason: string,
 *   requiresCapability: string | null,
 * }
 */
export function planRoute(prompt, availableProviders, options = {}) {
  const intent = detectIntent(prompt);

  switch (intent) {
    case "search": {
      const searchable = getProvidersWithCapability("search", availableProviders);
      if (searchable.length > 0) {
        return {
          strategy: "capable",
          providers: searchable,
          fallbackProviders: availableProviders.filter(p => !searchable.includes(p)),
          reason: `Search required — using ${searchable.join(", ")} (search-capable)`,
          intent,
          requiresCapability: "search",
        };
      }
      // No search-capable agents available, fall through to all
      return {
        strategy: "all",
        providers: availableProviders,
        fallbackProviders: [],
        reason: "Search requested but no search-capable agents available — asking all",
        intent,
        requiresCapability: "search",
      };
    }

    case "codeReview":
    case "comparison":
    case "reasoning":
    case "general":
    default:
      return {
        strategy: "all",
        providers: availableProviders,
        fallbackProviders: [],
        reason: `${intent} — asking all agents for diverse perspectives`,
        intent,
        requiresCapability: null,
      };
  }
}

// ============================================================
// MODERATOR EXECUTION
// ============================================================

/**
 * Run a moderated query:
 * 1. Detect intent
 * 2. Route to appropriate agents
 * 3. Collect results
 * 4. Return structured output with routing metadata
 *
 * Options:
 *   - models: { provider: model }
 *   - timeout: ms
 *   - onResult: (result) => void  — called as each agent finishes
 *   - onChunk: (provider, delta) => void  — streaming chunks
 *   - onRoute: (plan) => void  — called when routing is decided
 */
export async function moderatedQuery(prompt, availableProviders, options = {}) {
  const { models = {}, timeout = 120000, onResult, onChunk, onRoute } = options;

  // 1. Plan route
  const plan = planRoute(prompt, availableProviders);
  if (onRoute) onRoute(plan);

  // 2. Execute against selected providers
  const results = [];
  const promises = plan.providers.map(async (pid) => {
    try {
      const r = await runProvider(pid, prompt, {
        model: models[pid],
        timeout,
        onChunk: onChunk ? (provider, delta) => onChunk(provider, delta) : undefined,
      });
      const result = { ...r, routed: true };
      results.push(result);
      if (onResult) onResult(result);
      return result;
    } catch (err) {
      const result = { text: `[Error] ${err.message}`, elapsed: 0, provider: pid, error: true, routed: true };
      results.push(result);
      if (onResult) onResult(result);
      return result;
    }
  });

  await Promise.all(promises);

  // 3. If search intent but some agents couldn't search, note it
  const skippedNote = plan.fallbackProviders.length > 0
    ? `Note: ${plan.fallbackProviders.join(", ")} skipped (no ${plan.requiresCapability} capability)`
    : null;

  return {
    intent: plan.intent,
    strategy: plan.strategy,
    reason: plan.reason,
    skippedNote,
    results,
  };
}
