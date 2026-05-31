import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { handleLargePrompt } from "../src/large-prompt.js";

test("short prompts pass through untouched", () => {
  const r = handleLargePrompt("hello");
  assert.equal(r.offloaded, false);
  assert.equal(r.filePath, null);
  assert.equal(r.prompt, "hello");
});

test("empty prompt is not offloaded", () => {
  const r = handleLargePrompt("");
  assert.equal(r.offloaded, false);
});

test("large prompts are offloaded to a temp file", () => {
  const big = "x".repeat(5000);
  const r = handleLargePrompt(big, { userInstruction: "Review this" });
  try {
    assert.equal(r.offloaded, true);
    assert.ok(r.filePath && existsSync(r.filePath), "temp file should exist");
    assert.ok(r.prompt.includes(r.filePath), "wrapper should reference the file path");
    assert.ok(r.prompt.includes("Review this"), "wrapper should use the instruction");
    assert.ok(!r.prompt.includes(big), "wrapper should not inline the full prompt");
  } finally {
    if (r.filePath && existsSync(r.filePath)) rmSync(r.filePath);
  }
});
