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

const PM_SYSTEM_PROMPT = `You are Lun — a PM-style coding agent that orchestrates other AI agents.

You have access to these specialist agents as tools:
{AGENTS_LIST}

Your role:
1. Listen to the user's request
2. Decide if you can answer directly OR if you need to delegate to specialists
3. When delegating, use the format: <call agent="name">your question</call>
4. After receiving specialist responses, synthesize and answer the user
5. Be concise and practical

Examples:
- Simple question → answer directly
- Code review needed → <call agent="claude">review this code: ...</call>
- Latest news → <call agent="kiro">search recent news on X</call>
- Multi-perspective decision → <call agent="all">REST vs GraphQL?</call>

Always respond in the user's language.`;

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
  const callRegex = /<call\s+agent="([^"]+)">([\s\S]*?)<\/call>/g;
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
function buildPromptForPM(systemPrompt, history, userMessage, toolResults = []) {
  let prompt = systemPrompt + "\n\n## Conversation\n\n";
  for (const turn of history) {
    prompt += `User: ${turn.user}\nAssistant: ${turn.assistant}\n\n`;
  }
  prompt += `User: ${userMessage}\n`;
  if (toolResults.length > 0) {
    prompt += `\n## Tool Results\n\n`;
    for (const r of toolResults) {
      prompt += `### ${r.agent}\n${r.text}\n\n`;
    }
    prompt += `Now provide your final answer to the user based on the tool results above.\n`;
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
 * @param {Function} options.onToolCall - Called when PM delegates to a tool
 * @param {Function} options.onToolResult - Called when a tool returns
 * @param {Function} options.onPMThinking - Called when PM is thinking
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
    onToolCall,
    onToolResult,
    onPMThinking,
    onPMResponse,
    timeout = 120000,
    maxToolRounds = 3,
  } = options;

  if (!checkAvailable(pmAgent)) {
    throw new Error(`PM agent "${pmAgent}" is not installed`);
  }

  const systemPrompt = buildSystemPrompt(availableAgents);
  let toolResults = [];
  let pmResponse = "";

  for (let round = 0; round < maxToolRounds; round++) {
    if (onPMThinking) onPMThinking(round);

    const fullPrompt = buildPromptForPM(systemPrompt, history, userMessage, toolResults);
    const result = await runProvider(pmAgent, fullPrompt, {
      model: pmModel,
      timeout,
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
                const r = await runProvider(a, call.prompt, { model: models[a], timeout });
                return { agent: a, text: r.text, elapsed: r.elapsed };
              } catch (err) {
                return { agent: a, text: `[Error] ${err.message}`, elapsed: 0, error: true };
              }
            })
          );
          const combined = allResults.map(r => `### ${r.agent}\n${r.text}`).join("\n\n");
          return { agent: "all", text: combined, elapsed: 0 };
        }

        // Single agent call
        if (!checkAvailable(call.agent)) {
          return { agent: call.agent, text: `[Error] Agent "${call.agent}" not available`, elapsed: 0, error: true };
        }
        const r = await runProvider(call.agent, call.prompt, {
          model: models[call.agent],
          timeout,
        });
        return { agent: call.agent, text: r.text, elapsed: r.elapsed };
      } catch (err) {
        return { agent: call.agent, text: `[Error] ${err.message}`, elapsed: 0, error: true };
      }
    }));

    if (onToolResult) for (const r of newResults) onToolResult(r.agent, r.text, r.elapsed);
    toolResults.push(...newResults);
  }

  // Max rounds reached, return what we have
  if (onPMResponse) onPMResponse(pmResponse, 0);
  return { response: pmResponse, elapsed: 0, toolCalls: toolResults };
}
