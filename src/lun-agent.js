/**
 * Lun Agent — PM-style conversational agent.
 *
 * Uses an existing CLI agent (e.g., Codex GPT-5.5) as the LLM backend,
 * similar to how SCA uses SAM API.
 *
 * The agent:
 * - Maintains conversation history
 * - Has access to "tools" — other CLI agents
 * - Routes work to specialized agents when needed
 * - Synthesizes responses
 */
import { runProvider } from "./runner.js";
import { PROVIDERS, checkAvailable } from "./providers.js";

const PM_SYSTEM_PROMPT = `You are Lun — the user's delegate to a panel of AI agents. The user wants a well-rounded answer informed by multiple agents, not just one.

Tools (agents you can consult): {AGENTS_LIST}

To delegate: <call agent="name">a clear, specific question</call>
To ask everyone in parallel: <call agent="all">the question</call>

HOW YOU WORK EACH TURN:
1. Figure out the user's real intent first.
2. Trivial message (greeting, chit-chat, simple math/fact) → answer directly, NO tools.
3. Otherwise → DELEGATE. This is your main job. Decide:
   - Opinion / "vs" / design / review / "what's best" → <call agent="all"> so you get multiple perspectives.
   - A task that clearly fits one agent (e.g. "latest/recent" info → kiro or agy) → call that agent.
   - You may craft DIFFERENT, tailored questions for different agents when that gets better answers.
4. When delegating, output ONLY the <call> tag(s) for that step — no other text.
5. After you receive the agents' answers, write your final report.

Reply in the user's language. Be concise.`;

// Final-report instructions, swapped by style.
const REPORT_INSTRUCTION = {
  brief: `Write a BRIEF report as the user's delegate (this is your synthesized opinion):
- 2-4 sentences: the bottom-line recommendation / consensus.
- Then 1-3 short bullets: key agreement(s) and any notable disagreement.
- Do NOT restate each agent's full answer — the user can open those directly.
- End with one clear, actionable takeaway.`,
  detailed: `Write a DETAILED report as the user's delegate:
- ## Summary — the bottom-line recommendation (2-4 sentences).
- ## Where they agree — bullets.
- ## Where they differ — bullets, with which agent took which side and why.
- ## Recommendation — your concrete, actionable conclusion.
Be thorough but do not pad. Use the user's language.`,
};

/**
 * Build the system prompt with available agents.
 */
function buildSystemPrompt(availableAgents) {
  const agentsList = availableAgents.map(a => {
    const def = PROVIDERS[a];
    return `- ${a}: ${def?.name || a}`;
  }).join("\n");
  return PM_SYSTEM_PROMPT.replace("{AGENTS_LIST}", agentsList);
}

/**
 * Parse <call agent="..."> blocks from PM response.
 * Returns: { text: "cleaned text", calls: [{agent, prompt}] }
 */
function parseToolCalls(text) {
  // Accept both single and double quotes
  const callRegex = /<call\s+agent=["']([^"']+)["']>([\s\S]*?)<\/call>/g;
  const calls = [];
  let match;
  while ((match = callRegex.exec(text)) !== null) {
    calls.push({ agent: match[1].trim(), prompt: match[2].trim() });
  }
  const cleanedText = text.replace(callRegex, "").trim();
  return { text: cleanedText, calls };
}

/**
 * Build the prompt for the PM agent.
 */
function buildPromptForPM(systemPrompt, history, userMessage, toolResults = [], reportStyle = "brief") {
  let prompt = systemPrompt + "\n\n## Conversation\n\n";
  for (const turn of history) {
    prompt += `User: ${turn.user}\nAssistant: ${turn.assistant}\n\n`;
  }
  prompt += `User: ${userMessage}\n`;
  if (toolResults.length > 0) {
    prompt += `\n## Agent Answers\n\n`;
    for (const r of toolResults) {
      prompt += `### ${r.agent}\n${r.text}\n\n`;
    }
    prompt += `\n${REPORT_INSTRUCTION[reportStyle] || REPORT_INSTRUCTION.brief}\n`;
  }
  prompt += `Assistant:`;
  return prompt;
}

/**
 * One conversation turn with the Lun agent.
 *
 * @param {Object} options
 * @param {string} options.pmAgent - The CLI agent acting as PM (e.g., "codex", "claude")
 * @param {string} options.pmModel - Model for the PM agent
 * @param {string[]} options.availableAgents - All available specialist agents
 * @param {Array} options.history - Conversation history [{user, assistant}]
 * @param {string} options.userMessage - User's current message
 * @param {Object} options.models - Models per agent
 * @param {string} options.cwd - Working directory for CLI agents
 * @param {Function} options.onToolCall - Called when PM delegates to a tool
 * @param {Function} options.onToolResult - Called when a tool returns
 * @param {Function} options.onPMThinking - Called when PM is thinking
 * @param {Function} options.onPMChunk - Called when PM streams text
 * @param {Function} options.onToolChunk - Called when a delegated agent streams text
 * @param {Function} options.onPMResponse - Called with final PM response
 */
export async function chatTurn(options) {
  const {
    pmAgent,
    pmModel,
    availableAgents,
    history = [],
    userMessage,
    models = {},
    cwd,
    onToolCall,
    onToolResult,
    onPMThinking,
    onPMChunk,
    onToolChunk,
    onPMResponse,
    timeout = 120000,
    maxToolRounds = 3,
    reportStyle = "brief",
  } = options;

  if (!checkAvailable(pmAgent)) {
    throw new Error(`PM agent "${pmAgent}" is not installed`);
  }

  const systemPrompt = buildSystemPrompt(availableAgents);
  let toolResults = [];
  let pmResponse = "";

  for (let round = 0; round < maxToolRounds; round++) {
    if (onPMThinking) onPMThinking(round);

    const fullPrompt = buildPromptForPM(systemPrompt, history, userMessage, toolResults, reportStyle);
    const result = await runProvider(pmAgent, fullPrompt, {
      model: pmModel,
      timeout,
      cwd,
      onChunk: onPMChunk,
    });

    pmResponse = result.text;
    const { text: cleanText, calls } = parseToolCalls(pmResponse);

    if (calls.length === 0) {
      // No more tool calls — this is the final answer
      if (onPMResponse) onPMResponse(cleanText, result.elapsed);
      return { response: cleanText, elapsed: result.elapsed, toolCalls: toolResults };
    }

    // Execute tool calls in parallel
    if (onToolCall) for (const c of calls) onToolCall(c.agent, c.prompt);

    const newResults = await Promise.all(calls.map(async (call) => {
      try {
        // Special: "all" calls all agents in parallel (existing moderator pattern)
        if (call.agent === "all") {
          const allResults = await Promise.all(
            availableAgents.filter(a => a !== pmAgent).map(async (a) => {
              try {
                if (onToolCall) onToolCall(a, call.prompt);
                const r = await runProvider(a, call.prompt, { model: models[a], timeout, cwd, onChunk: onToolChunk });
                const result = { agent: a, model: models[a] || "auto", text: r.text, elapsed: r.elapsed };
                if (onToolResult) onToolResult(result.agent, result.text, result.elapsed);
                return result;
              } catch (err) {
                const result = { agent: a, model: models[a] || "auto", text: `[Error] ${err.message}`, elapsed: 0, error: true };
                if (onToolResult) onToolResult(result.agent, result.text, result.elapsed);
                return result;
              }
            })
          );
          const combined = allResults.map(r => `### ${r.agent}\n${r.text}`).join("\n\n");
          return { agent: "all", text: combined, elapsed: Math.max(0, ...allResults.map(r => r.elapsed || 0)), synthetic: true, children: allResults };
        }

        // Single agent call
        if (!checkAvailable(call.agent)) {
          return { agent: call.agent, text: `[Error] Agent "${call.agent}" not available`, elapsed: 0, error: true };
        }
        const r = await runProvider(call.agent, call.prompt, {
          model: models[call.agent],
          timeout,
          cwd,
          onChunk: onToolChunk,
        });
        return { agent: call.agent, model: models[call.agent] || "auto", text: r.text, elapsed: r.elapsed };
      } catch (err) {
        return { agent: call.agent, text: `[Error] ${err.message}`, elapsed: 0, error: true };
      }
    }));

    if (onToolResult) for (const r of newResults) {
      if (!r.synthetic) onToolResult(r.agent, r.text, r.elapsed);
    }
    toolResults.push(...newResults);
  }

  // Max rounds reached, return what we have
  if (onPMResponse) onPMResponse(pmResponse, 0);
  return { response: pmResponse, elapsed: 0, toolCalls: toolResults };
}
