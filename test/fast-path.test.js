import { test } from "node:test";
import assert from "node:assert/strict";
import { localFastPath } from "../src/fast-path.js";

test("greetings get a local answer", () => {
  assert.equal(typeof localFastPath("hello"), "string");
  assert.equal(typeof localFastPath("안녕"), "string");
});

test("basic arithmetic is computed locally", () => {
  assert.equal(localFastPath("2+2"), "4");
  assert.equal(localFastPath("10*3"), "30");
  assert.equal(localFastPath("7-9"), "-2");
});

test("division by zero is handled", () => {
  assert.match(localFastPath("5/0"), /나눌 수 없/);
});

test("non-integer results are trimmed", () => {
  assert.equal(localFastPath("1/4"), "0.25");
});

test("real questions fall through (null)", () => {
  assert.equal(localFastPath("Should I use REST or GraphQL?"), null);
  assert.equal(localFastPath("explain closures"), null);
});
