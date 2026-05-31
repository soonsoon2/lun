import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAPABILITIES,
  getProvidersWithCapability,
  getProvidersWithout,
} from "../src/capabilities.js";

test("getProvidersWithCapability returns only providers that have it", () => {
  const available = Object.keys(CAPABILITIES);
  const withSearch = getProvidersWithCapability("search", available);
  for (const pid of withSearch) {
    assert.equal(CAPABILITIES[pid].search, true, `${pid} should have search`);
  }
});

test("getProvidersWithout is the complement of getProvidersWithCapability", () => {
  const available = Object.keys(CAPABILITIES);
  const withCap = getProvidersWithCapability("search", available);
  const without = getProvidersWithout("search", available);
  // No overlap
  for (const pid of withCap) {
    assert.ok(!without.includes(pid), `${pid} cannot be in both lists`);
  }
  // Together they cover everyone
  assert.equal(withCap.length + without.length, available.length);
});

test("filters respect the availableProviders argument", () => {
  const subset = ["kiro"];
  const result = getProvidersWithCapability("search", subset);
  for (const pid of result) {
    assert.ok(subset.includes(pid));
  }
});

test("unknown capability yields an empty 'with' list", () => {
  const available = Object.keys(CAPABILITIES);
  assert.deepEqual(getProvidersWithCapability("__nope__", available), []);
});
