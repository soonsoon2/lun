/**
 * Moderator — the orchestration brain of Lun.
 *
 * Analyzes user intent, routes to appropriate agents based on capabilities,
 * collects results, and synthesizes a coherent response.
 */
import { CAPABILITIES, getProvidersWithCapability } from "./capabilities.js";
import { PROVIDERS, checkAvailable } from "./providers.js";
import { runProvider } from "./runner.js";
import { detectSkill, agentsBySkill, SKILLS } from "./skills.js";

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
  // Skill-based routing first (more precise)
  const skill = detectSkill(prompt);
  if (skill) {
    const ranked = agentsBySkill(skill, availableProviders);
    const capable = ranked.map(r => r.agent);
    const skipped = availableProviders.filter(p => !capable.includes(p));

    if (capable.length > 0) {
      const detail = ranked.map(r => `${r.agent}(${r.level})`).join(", ");
      return {
        strategy: "skill",
        providers: capable,
        fallbackProviders: skipped,
        reason: `Skill: ${SKILLS[skill]?.label || skill} — using ${detail}`,
        intent: skill,
        skill,
        requiresCapability: skill,
      };
    }
  }

  // Fallback to intent-based routing
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
  const { models = {}, timeout = 120000, cwd, onResult, onChunk, onRoute } = options;

  // 1. Plan route
  const plan = planRoute(prompt, availableProviders);
  if (onRoute) onRoute(plan);

  // 2. Execute against selected providers
  const results = [];
  const promises = plan.providers.map(async (pid) => {
    try {
      const r = await runProvider(pid, prompt, {
        model: models[pid],
        cwd,
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

// ============================================================
// DISCUSSION TECHNIQUES (relay-style). PM picks one, or user forces it.
// Each gives the next speaker a stance relative to what was already said.
// ============================================================
export const DISCUSSION_TECHNIQUES = {
  debate: {
    label: "Debate",
    desc: "Take a side and argue it against what was said.",
    instruction: `Take a clear position on the question. If previous speakers leaned one way, argue the strongest opposing case. Defend your stance with concrete reasons.`,
  },
  devils_advocate: {
    label: "Devil's Advocate",
    desc: "Attack the strongest point made so far.",
    instruction: `Find the WEAKEST link in what previous speakers said and challenge it directly. Even if you mostly agree, surface the biggest risk or hidden assumption they missed.`,
  },
  build: {
    label: "Build & Extend",
    desc: "Add to and improve prior answers.",
    instruction: `Build on the best ideas so far. Add what's missing, refine the reasoning, and push the answer closer to something actionable. Don't just repeat — extend.`,
  },
};

export const DEFAULT_TECHNIQUE = "build";

// Short-and-punchy directive used for every relay turn.
const RELAY_BREVITY = `Keep it SHORT and punchy: at most 4 sentences or 4 bullets. State only your core point — no filler, no preamble, no restating the question.`;

/**
 * Build a relay-turn prompt: the speaker sees the question, the technique,
 * and everything said so far in this round (sequential relay).
 */
function buildRelayPrompt({ question, technique, priorTurns, isFirst }) {
  const tech = DISCUSSION_TECHNIQUES[technique] || DISCUSSION_TECHNIQUES[DEFAULT_TECHNIQUE];
  let p = `You are a panelist in a moderated relay discussion.\n\nQuestion: ${question}\n\nDiscussion style — ${tech.label}: ${tech.instruction}\n\n${RELAY_BREVITY}\n`;
  if (!isFirst && priorTurns.length) {
    p += `\n## What's been said so far (most recent last)\n`;
    for (const t of priorTurns) {
      p += `\n### ${t.provider}\n${t.text}\n`;
    }
    p += `\nNow add YOUR turn. React to the above per the discussion style. Do not repeat points already made.`;
  } else {
    p += `\nYou speak first. Open the discussion with your core position.`;
  }
  return p;
}

const PICK_TECHNIQUE_PROMPT = `You are moderating a multi-agent discussion. Based on the user's question, pick the most useful discussion style.

Options:
- debate: when there are clear competing options/sides.
- devils_advocate: when one obvious answer needs stress-testing.
- build: when the goal is to construct the best combined answer.

Question: {QUESTION}

Reply with ONLY one word: debate, devils_advocate, or build.`;

const CONCLUDE_CHECK_PROMPT = `You are the moderator and the user's delegate. The user wants a useful conclusion, not endless talk.

Question: {QUESTION}

Discussion so far:
{TRANSCRIPT}

Decide: has the discussion converged enough to conclude, or is another round genuinely valuable?
Reply with ONLY one word: CONCLUDE or CONTINUE.`;

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
 * Run a relay-style moderated discussion.
 *
 * Flow per round:
 * 1. (round 1 only) PM picks a technique unless one is forced.
 * 2. Panelists speak ONE BY ONE; each sees everything said before it (relay).
 * 3. Moderator synthesizes the round.
 * 4. PM judges CONCLUDE vs CONTINUE (when unlimited); bounded by maxTurns/maxTime.
 *
 * Options:
 *   - moderator, moderatorModel, models
 *   - technique: "debate" | "devils_advocate" | "build" | "auto" (PM picks)
 *   - maxTurns: number, or 0 / Infinity for unlimited (PM decides when to stop)
 *   - maxTime: seconds cap (0 = no time cap)
 *   - turnTimeout: per-speaker timeout ms (short, to keep answers punchy)
 *   - timeout: moderator/synthesis timeout ms
 *   - shouldStop: () => boolean  — external stop signal (UI stop button)
 *   - onTechnique, onTurnStart, onPanelistStart, onResult, onSynthesis, onConclude
 */
export async function discuss(originalPrompt, availableProviders, options = {}) {
  const {
    moderator = "claude",
    moderatorModel,
    models = {},
    technique = "auto",
    maxTurns = 3,
    maxTime = 120,
    turnTimeout = 45000,
    timeout = 120000,
    shouldStop,
    onTechnique,
    onTurnStart,
    onPanelistStart,
    onResult,
    onSynthesis,
    onConclude,
  } = options;

  const startTime = Date.now();
  const panelists = availableProviders;
  const unlimited = !maxTurns || maxTurns === Infinity || maxTurns <= 0;
  const hardCap = unlimited ? 50 : maxTurns; // safety ceiling for "unlimited"

  // 1. Resolve technique (PM picks if "auto")
  let activeTechnique = technique;
  if (technique === "auto") {
    try {
      const pick = await runProvider(moderator, PICK_TECHNIQUE_PROMPT.replace("{QUESTION}", originalPrompt), {
        model: moderatorModel || models[moderator],
        timeout: 30000,
      });
      const word = (pick.text || "").toLowerCase().match(/debate|devils_advocate|build/);
      activeTechnique = word ? word[0] : DEFAULT_TECHNIQUE;
    } catch {
      activeTechnique = DEFAULT_TECHNIQUE;
    }
  }
  if (!DISCUSSION_TECHNIQUES[activeTechnique]) activeTechnique = DEFAULT_TECHNIQUE;
  if (onTechnique) onTechnique(activeTechnique, DISCUSSION_TECHNIQUES[activeTechnique]);

  const turns = [];
  let currentQuestion = originalPrompt;
  const timeUp = () => maxTime > 0 && (Date.now() - startTime) / 1000 >= maxTime;
  const stopped = () => (typeof shouldStop === "function" && shouldStop());

  for (let turn = 1; turn <= hardCap; turn++) {
    if (stopped()) break;
    if (turn > 1 && timeUp()) break;
    if (onTurnStart) onTurnStart(turn, currentQuestion, activeTechnique);

    // 2. Relay: each panelist sees prior speakers' answers this round.
    const results = [];
    const priorTurns = [];
    for (const pid of panelists) {
      if (stopped()) break;
      if (onPanelistStart) onPanelistStart(pid);
      const relayPrompt = buildRelayPrompt({
        question: currentQuestion,
        technique: activeTechnique,
        priorTurns,
        isFirst: priorTurns.length === 0,
      });
      try {
        const r = await runProvider(pid, relayPrompt, { model: models[pid], timeout: turnTimeout });
        results.push(r);
        priorTurns.push({ provider: pid, text: r.text });
        if (onResult) onResult(r);
      } catch (err) {
        const r = { text: `[Error] ${err.message}`, elapsed: 0, provider: pid, error: true };
        results.push(r);
        if (onResult) onResult(r);
      }
    }

    // 3. Moderator synthesizes the round.
    const synthResult = await synthesize(moderator, currentQuestion, results, {
      model: moderatorModel || models[moderator],
      timeout,
    });
    if (onSynthesis) onSynthesis(synthResult.text, synthResult.elapsed, turn);

    turns.push({
      turn,
      technique: activeTechnique,
      question: currentQuestion,
      results,
      synthesis: synthResult.text,
      synthesisElapsed: synthResult.elapsed,
    });

    // 4. Stop conditions.
    if (stopped()) break;
    if (turn >= hardCap) break;
    if (!unlimited && turn >= maxTurns) break;
    if (timeUp()) break;

    // PM judges whether to conclude (always for unlimited; also caps token waste).
    try {
      const transcript = turns.map(t => `Round ${t.turn} synthesis:\n${t.synthesis}`).join("\n\n");
      const decision = await runProvider(moderator, CONCLUDE_CHECK_PROMPT
        .replace("{QUESTION}", originalPrompt)
        .replace("{TRANSCRIPT}", transcript), {
        model: moderatorModel || models[moderator],
        timeout: 30000,
      });
      if (/conclude/i.test(decision.text || "")) {
        if (onConclude) onConclude("converged");
        break;
      }
    } catch {
      // if the check fails, fall through to next round (bounded by caps)
    }

    // 5. Generate next-round follow-up question.
    try {
      const followup = await generateFollowup(moderator, originalPrompt, results, synthResult.text, {
        model: moderatorModel || models[moderator],
      });
      currentQuestion = followup;
    } catch {
      break;
    }
  }

  return {
    originalPrompt,
    moderator,
    technique: activeTechnique,
    turns,
    totalTime: ((Date.now() - startTime) / 1000).toFixed(1),
  };
}
