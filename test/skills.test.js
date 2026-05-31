import { test } from "node:test";
import assert from "node:assert/strict";
import { agentsBySkill, skillsOf, detectSkill, AGENT_SKILLS } from "../src/skills.js";

test("agentsBySkill sorts by capability rank (expert first)", () => {
  const all = Object.keys(AGENT_SKILLS);
  const ranked = agentsBySkill("code-gen", all);
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i - 1].rank >= ranked[i].rank, "ranks should be descending");
  }
});

test("agentsBySkill excludes agents with level 'none'", () => {
  const all = Object.keys(AGENT_SKILLS);
  const ranked = agentsBySkill("web-search", all);
  for (const r of ranked) {
    assert.notEqual(r.level, "none");
  }
  // claude has web-search: none → must be excluded
  assert.ok(!ranked.some(r => r.agent === "claude"));
});

test("skillsOf returns the agent's skill map, or empty for unknown", () => {
  assert.equal(typeof skillsOf("claude"), "object");
  assert.ok("code-gen" in skillsOf("claude"));
  assert.deepEqual(skillsOf("__nope__"), {});
});

test("detectSkill picks web-search for time-sensitive prompts", () => {
  assert.equal(detectSkill("what's the latest news on this"), "web-search");
  assert.equal(detectSkill("최근 업데이트 검색해줘"), "web-search");
});

test("detectSkill picks code-review for review prompts", () => {
  assert.equal(detectSkill("please review this code for bugs"), "code-review");
});

test("detectSkill returns null for generic chat", () => {
  assert.equal(detectSkill("hello, how are you"), null);
});
