import { test } from "node:test";
import assert from "node:assert/strict";
import { stripAnsi, cleanOutput } from "../src/runner.js";

test("stripAnsi removes color escape codes", () => {
  const input = "\x1b[31mred\x1b[0m text";
  assert.equal(stripAnsi(input), "red text");
});

test("stripAnsi removes OSC sequences and control chars", () => {
  const input = "\x1b]0;title\x07hello\x00world";
  assert.equal(stripAnsi(input), "helloworld");
});

test("stripAnsi leaves clean text untouched", () => {
  assert.equal(stripAnsi("just plain text"), "just plain text");
});

test("cleanOutput strips known CLI banner noise", () => {
  const raw = [
    "Warning: something",
    "All tools are now trusted",
    "real answer line",
  ].join("\n");
  const out = cleanOutput(raw);
  assert.ok(out.includes("real answer line"));
  assert.ok(!out.includes("Warning:"));
  assert.ok(!out.includes("All tools are now trusted"));
});

test("cleanOutput collapses excessive blank lines", () => {
  const out = cleanOutput("a\n\n\n\n\nb");
  assert.equal(out, "a\n\nb");
});
