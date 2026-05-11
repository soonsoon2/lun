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

// ============================================================
// MODERATOR SYNTHESIS — the moderator agent summarizes all results
// ============================================================

const PANELIST_SYSTEM = `You are a panelist in a multi-agent discussion. Give your honest, specific opinion on the question. Be concise (3-5 key points max). If you disagree with a common approach, say so clearly and explain why. End with your concrete recommendation.`;

const SYNTHESIS_PROMPT = `You are the moderator of a multi-agent panel discussion. You just heard from multiple AI agents on the same question.

Your job as moderator:
1. Briefly summarize each panelist's position (1 sentence each)
2. Identify CONSENSUS — what do they all agree on?
3. Identify CONFLICTS — where do they disagree? Why?
4. Give YOUR OWN opinion as moderator
5. State a clear, actionable recommendation

Be direct and practical. Use the same language as the original question.

## Question Asked
{QUESTION}

## Panelist Responses
{RESPONSES}

## Your Moderator Summary`;

const FOLLOWUP_PROMPT = `You are moderating a panel discussion. The panelists gave their initial answers but there are unresolved disagreements or areas that need deeper exploration.

Your job: Generate ONE specific follow-up question that will:
- Challenge the weakest argument
- Or explore the most important unresolved trade-off
- Or ask for concrete evidence/examples

The question should force the panelists to go deeper, not repeat themselves.

## Original Question
{QUESTION}

## Panelist Responses
{RESPONSES}

## Your Previous Synthesis
{SYNTHESIS}

## Generate exactly ONE follow-up question (nothing else):`;

/**
 * Run moderator synthesis — the moderator agent summarizes all results.
 */
export async function synthesize(moderatorId, originalPrompt, results, options = {}) {
  const { model, timeout = 120000, onChunk } = options;

  const responsesText = results
    .filter(r => !r.error)
    .map(r => `### ${PROVIDERS[r.provider]?.name || r.provider}\n${r.text}`)
    .join("\n\n");

  const prompt = SYNTHESIS_PROMPT
    .replace("{QUESTION}", originalPrompt)
    .replace("{RESPONSES}", responsesText);

  return runProvider(moderatorId, prompt, { model, timeout, onChunk });
}

/**
 * Generate a follow-up question for the next discussion round.
 */
export async function generateFollowup(moderatorId, originalPrompt, results, synthesis, options = {}) {
  const { model, timeout = 60000 } = options;

  const responsesText = results
    .filter(r => !r.error)
    .map(r => `### ${PROVIDERS[r.provider]?.name || r.provider}\n${r.text}`)
    .join("\n\n");

  const prompt = FOLLOWUP_PROMPT
    .replace("{QUESTION}", originalPrompt)
    .replace("{RESPONSES}", responsesText)
    .replace("{SYNTHESIS}", synthesis);

  const result = await runProvider(moderatorId, prompt, { model, timeout });
  return result.text.trim();
}

/**
 * Run a full autonomous discussion with debate-style pacing.
 *
 * Flow per round:
 * 1. Moderator frames the question (onModeratorSpeak)
 * 2. Each panelist answers ONE BY ONE sequentially (onResult)
 * 3. Moderator synthesizes (onSynthesis)
 * 4. Moderator generates follow-up → next round
 *
 * Options:
 *   - moderator: provider ID for the moderator
 *   - moderatorModel: model for the moderator
 *   - models: { provider: model } for panelists
 *   - maxTurns: max discussion rounds (default: 3)
 *   - maxTime: max total time in seconds (default: 120)
 *   - timeout: per-provider timeout in ms
 *   - onTurnStart: (turnNumber, question) => void
 *   - onPanelistStart: (provider) => void — about to ask this panelist
 *   - onResult: (result) => void — panelist answered
 *   - onSynthesis: (text, elapsed) => void
 *   - onFollowup: (question) => void
 *   - onRoute: (plan) => void
 */
export async function discuss(originalPrompt, availableProviders, options = {}) {
  const {
    moderator = "claude",
    moderatorModel,
    models = {},
    maxTurns = 3,
    maxTime = 120,
    timeout = 120000,
    onTurnStart,
    onPanelistStart,
    onResult,
    onSynthesis,
    onFollowup,
    onRoute,
  } = options;

  const startTime = Date.now();
  // Moderator participates as panelist too
  const panelists = availableProviders;

  const turns = [];
  let currentQuestion = originalPrompt;

  for (let turn = 1; turn <= maxTurns; turn++) {
    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed >= maxTime && turn > 1) break;

    if (onTurnStart) onTurnStart(turn, currentQuestion);

    // 1. Ask panelists ONE BY ONE (sequential for debate feel)
    const results = [];
    for (const pid of panelists) {
      if (onPanelistStart) onPanelistStart(pid);
      // Wrap prompt with panelist system instruction
      const panelistPrompt = turn === 1
        ? `${PANELIST_SYSTEM}\n\n## Question\n${currentQuestion}`
        : `${PANELIST_SYSTEM}\n\nThis is a follow-up question in an ongoing discussion. The moderator wants you to go deeper.\n\n## Follow-up Question\n${currentQuestion}`;
      try {
        const r = await runProvider(pid, panelistPrompt, {
          model: models[pid],
          timeout,
        });
        results.push(r);
        if (onResult) onResult(r);
      } catch (err) {
        const r = { text: `[Error] ${err.message}`, elapsed: 0, provider: pid, error: true };
        results.push(r);
        if (onResult) onResult(r);
      }
    }

    // 2. Moderator synthesizes all panelist answers
    const synthResult = await synthesize(moderator, currentQuestion, results, {
      model: moderatorModel || models[moderator],
      timeout,
    });

    if (onSynthesis) onSynthesis(synthResult.text, synthResult.elapsed);

    turns.push({
      turn,
      question: currentQuestion,
      results,
      synthesis: synthResult.text,
      synthesisElapsed: synthResult.elapsed,
    });

    // 3. Check if we should continue
    if (turn >= maxTurns) break;
    const totalElapsed = (Date.now() - startTime) / 1000;
    if (totalElapsed >= maxTime) break;

    // 4. Generate follow-up
    try {
      const followup = await generateFollowup(moderator, originalPrompt, results, synthResult.text, {
        model: moderatorModel || models[moderator],
      });
      if (onFollowup) onFollowup(followup);
      currentQuestion = followup;
    } catch {
      break;
    }
  }

  return {
    originalPrompt,
    moderator,
    turns,
    totalTime: ((Date.now() - startTime) / 1000).toFixed(1),
  };
}
