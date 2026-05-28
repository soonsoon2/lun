/**
 * Skill catalog and agent capability matrix.
 *
 * Each skill represents a specialized capability. Agents are rated by skill level:
 *   - "expert"  : top-tier in this skill
 *   - "native"  : built-in tool support (e.g., real web search)
 *   - "common"  : capable, average quality
 *   - "none"    : explicitly unavailable
 */

export const SKILLS = {
  "chat": {
    label: "General chat",
    description: "Conversational responses, greetings, simple Q&A",
  },
  "code-gen": {
    label: "Code generation",
    description: "Write new code from a description",
  },
  "code-review": {
    label: "Code review",
    description: "Analyze existing code for bugs, style, security",
  },
  "web-search": {
    label: "Web search",
    description: "Find current information from the web",
    requiresNative: true,
  },
  "image-analysis": {
    label: "Image analysis",
    description: "Analyze visual content from images",
  },
  "long-context": {
    label: "Long context",
    description: "Handle large documents (>200K tokens)",
  },
  "deep-reasoning": {
    label: "Deep reasoning",
    description: "Multi-step logical reasoning, complex problem solving",
  },
  "fast-routing": {
    label: "Fast routing",
    description: "Quick decisions, lightweight responses for orchestration",
  },
  "file-edit": {
    label: "File editing",
    description: "Read and modify project files",
  },
  "shell-exec": {
    label: "Shell execution",
    description: "Run terminal commands",
  },
};

/**
 * Skill matrix: agent → skill → level
 */
export const AGENT_SKILLS = {
  kiro: {
    "chat": "common",
    "code-gen": "common",
    "code-review": "common",
    "web-search": "native",       // built-in search tool
    "image-analysis": "none",
    "long-context": "common",
    "deep-reasoning": "common",
    "fast-routing": "common",
    "file-edit": "native",
    "shell-exec": "native",
  },
  claude: {
    "chat": "expert",
    "code-gen": "expert",
    "code-review": "expert",
    "web-search": "none",          // no native search in -p mode
    "image-analysis": "none",
    "long-context": "expert",      // opus 200K, opus[1m] 1M
    "deep-reasoning": "expert",    // opus
    "fast-routing": "expert",      // haiku/sonnet very fast
    "file-edit": "native",
    "shell-exec": "native",
  },
  copilot: {
    "chat": "common",
    "code-gen": "expert",
    "code-review": "expert",
    "web-search": "none",
    "image-analysis": "none",
    "long-context": "common",
    "deep-reasoning": "expert",    // o3 access
    "fast-routing": "common",      // CLI overhead
    "file-edit": "native",
    "shell-exec": "native",
  },
  agy: {
    "chat": "common",
    "code-gen": "common",
    "code-review": "common",
    "web-search": "native",        // built-in search
    "image-analysis": "expert",    // multimodal native
    "long-context": "expert",
    "deep-reasoning": "common",
    "fast-routing": "common",
    "file-edit": "common",
    "shell-exec": "common",
  },
  codex: {
    "chat": "common",
    "code-gen": "expert",          // optimized for coding
    "code-review": "expert",
    "web-search": "native",
    "image-analysis": "expert",
    "long-context": "expert",
    "deep-reasoning": "expert",    // gpt-5.5
    "fast-routing": "common",      // heavy context loading
    "file-edit": "expert",
    "shell-exec": "expert",
  },
  cline: {
    "chat": "common",
    "code-gen": "common",
    "code-review": "common",
    "web-search": "none",
    "image-analysis": "none",
    "long-context": "common",
    "deep-reasoning": "common",
    "fast-routing": "common",
    "file-edit": "native",
    "shell-exec": "native",
  },
};

/**
 * Skill level priority for sorting.
 */
const LEVEL_RANK = { expert: 3, native: 2, common: 1, none: 0 };

/**
 * Get agents capable of a skill, sorted by capability.
 *
 * @param {string} skillId
 * @param {string[]} availableAgents — only consider these
 * @returns Array<{agent, level, rank}>
 */
export function agentsBySkill(skillId, availableAgents) {
  const result = [];
  for (const agent of availableAgents) {
    const skills = AGENT_SKILLS[agent];
    if (!skills) continue;
    const level = skills[skillId] || "none";
    if (level === "none") continue;
    result.push({ agent, level, rank: LEVEL_RANK[level] || 0 });
  }
  result.sort((a, b) => b.rank - a.rank);
  return result;
}

/**
 * Get all skill levels for an agent.
 */
export function skillsOf(agent) {
  return AGENT_SKILLS[agent] || {};
}

/**
 * Detect which skill is most relevant for a prompt.
 * Returns a skill ID or null if generic chat.
 */
const SKILL_PATTERNS = {
  "web-search": [
    /최근|latest|recent|현재|today|이번 주|this week/i,
    /검색|search|찾아|look up|find out/i,
    /뉴스|news|업데이트|update.*release/i,
  ],
  "image-analysis": [
    /이 이미지|이 사진|this image|this picture|analyze.*image/i,
    /\.(png|jpg|jpeg|gif|webp|bmp)\b/i,
  ],
  "code-review": [
    /리뷰|review|검토|check this code|review this/i,
    /버그|bug|보안|security|취약/i,
  ],
  "deep-reasoning": [
    /왜|why|어떻게.*설계|how should.*design/i,
    /trade.?off|장단점|복잡한.*분석|complex.*analysis/i,
  ],
  "long-context": [
    /긴 문서|long document|전체 코드베이스|entire codebase/i,
  ],
};

export function detectSkill(prompt) {
  for (const [skillId, patterns] of Object.entries(SKILL_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(prompt)) return skillId;
    }
  }
  return null;
}
