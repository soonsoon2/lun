import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateCost, isKnownModel } from "../src/pricing.js";

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

test("estimateCost handles zero / missing input", () => {
  assert.equal(estimateCost("gpt-5.4", 0, 0), 0);
});

test("isKnownModel is false for empty input", () => {
  assert.equal(isKnownModel(""), false);
  assert.equal(isKnownModel(null), false);
});
