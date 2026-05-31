import { test } from "node:test";
import assert from "node:assert/strict";
import { PROVIDERS } from "../src/providers.js";

test("every provider has the required shape", () => {
  for (const [id, def] of Object.entries(PROVIDERS)) {
    assert.equal(typeof def.name, "string", `${id}.name`);
    assert.equal(typeof def.bin, "string", `${id}.bin`);
    assert.equal(typeof def.defaultModel, "string", `${id}.defaultModel`);
    assert.equal(typeof def.buildArgs, "function", `${id}.buildArgs`);
    assert.equal(typeof def.getModels, "function", `${id}.getModels`);
  }
});

test("buildArgs returns an array containing the prompt as a single element", () => {
  const prompt = "hello world; rm -rf / `whoami`";
  for (const [id, def] of Object.entries(PROVIDERS)) {
    const args = def.buildArgs(prompt, def.defaultModel, {});
    assert.ok(Array.isArray(args), `${id} should return an array`);
    // The raw prompt must appear as its own argv element — never concatenated
    // into a shell string (this is what keeps spawn injection-safe).
    assert.ok(args.includes(prompt), `${id} should pass the prompt verbatim as one arg`);
  }
});

test("buildArgs includes a model flag when a non-auto model is given", () => {
  const args = PROVIDERS.claude.buildArgs("q", "opus", {});
  assert.ok(args.includes("opus"));
});

test("getModels always returns a non-empty list", () => {
  for (const [id, def] of Object.entries(PROVIDERS)) {
    const models = def.getModels();
    assert.ok(Array.isArray(models) && models.length > 0, `${id} models`);
    for (const m of models) {
      assert.equal(typeof m.id, "string", `${id} model.id`);
      assert.equal(typeof m.label, "string", `${id} model.label`);
    }
  }
});
