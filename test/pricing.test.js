import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateCost, isKnownModel, RATES, CHARS_PER_TOKEN } from "../src/pricing.js";

test("estimateCost returns a non-negative number", () => {
  const cost = estimateCost("gpt-5.4", 1000, 500);
  assert.equal(typeof cost, "number");
  assert.ok(cost >= 0);
});

test("estimateCost grows with more output", () => {
  const small = estimateCost("gpt-5.4", 1000, 100);
  const large = estimateCost("gpt-5.4", 1000, 10000);
  assert.ok(large > small);
});

test("estimateCost is zero for zero input/output", () => {
  assert.equal(estimateCost("gpt-5.4", 0, 0), 0);
});

test("estimateCost matches the published-rate formula", () => {
  // opus = [5.5, 27.5] per 1M tokens, 4 chars/token
  const inputChars = 4000;   // → 1000 input tokens
  const outputChars = 8000;  // → 2000 output tokens
  const expected = (1000 * 5.5 + 2000 * 27.5) / 1_000_000;
  assert.equal(estimateCost("opus", inputChars, outputChars), expected);
});

test("unknown models fall back to the default rate (still numeric)", () => {
  const cost = estimateCost("some-unknown-model", 4000, 4000);
  assert.equal(typeof cost, "number");
  assert.ok(cost > 0);
});

test("isKnownModel is true for a listed model, case-insensitive", () => {
  assert.equal(isKnownModel("opus"), true);
  assert.equal(isKnownModel("OPUS"), true);
});

test("isKnownModel is false for empty or unknown input", () => {
  assert.equal(isKnownModel(""), false);
  assert.equal(isKnownModel(null), false);
  assert.equal(isKnownModel("totally-made-up"), false);
});

test("CHARS_PER_TOKEN is a positive number and RATES is populated", () => {
  assert.ok(CHARS_PER_TOKEN > 0);
  assert.ok(Object.keys(RATES).length > 0);
});
