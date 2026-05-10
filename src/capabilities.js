/**
 * Agent capabilities matrix.
 * Defines what each provider can and cannot do.
 * Used by the moderator to route tasks to the right agent.
 */

export const CAPABILITIES = {
  kiro: {
    search: true,
    codeGen: true,
    codeReview: true,
    fileAccess: true,
    shellExec: true,
    imageAnalysis: false,
    longContext: true,
    reasoning: true,
    strengths: ["web search", "multi-model access", "tool use", "file operations"],
    weaknesses: [],
  },
  claude: {
    search: false,
    codeGen: true,
    codeReview: true,
    fileAccess: true,
    shellExec: true,
    imageAnalysis: false,
    longContext: true,
    reasoning: true,
    strengths: ["deep reasoning (opus)", "code quality", "nuanced analysis", "long context"],
    weaknesses: ["no web search"],
  },
  copilot: {
    search: false,
    codeGen: true,
    codeReview: true,
    fileAccess: true,
    shellExec: true,
    imageAnalysis: false,
    longContext: false,
    reasoning: true,
    strengths: ["GitHub ecosystem", "code generation", "o3 reasoning"],
    weaknesses: ["no web search", "shorter context window"],
  },
  // Future providers
  codex: {
    search: true,
    codeGen: true,
    codeReview: true,
    fileAccess: true,
    shellExec: true,
    imageAnalysis: true,
    longContext: true,
    reasoning: true,
    strengths: ["web search", "image analysis", "code execution", "broad knowledge"],
    weaknesses: [],
  },
  gemini: {
    search: true,
    codeGen: true,
    codeReview: true,
    fileAccess: true,
    shellExec: true,
    imageAnalysis: true,
    longContext: true,
    reasoning: true,
    strengths: ["web search", "multimodal", "very long context (1M+)", "Google ecosystem"],
    weaknesses: [],
  },
};

/**
 * Get providers that have a specific capability.
 */
export function getProvidersWithCapability(capability, availableProviders) {
  return availableProviders.filter(pid => CAPABILITIES[pid]?.[capability]);
}

/**
 * Get providers that lack a specific capability.
 */
export function getProvidersWithout(capability, availableProviders) {
  return availableProviders.filter(pid => !CAPABILITIES[pid]?.[capability]);
}
