import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coerceModelToChoices,
  defaultModelForProviderSelect,
  resolveModelChoices,
  withCurrentModelOption,
} from "./provider-models";

describe("resolveModelChoices", () => {
  it("returns curated OpenRouter ids", () => {
    const list = resolveModelChoices({ provider: "openrouter" });
    assert.ok(list.includes("openai/gpt-4o-mini"));
    assert.ok(list.includes("anthropic/claude-3.5-sonnet"));
  });

  it("prefers fetched local Ollama models over starters", () => {
    const list = resolveModelChoices({
      provider: "ollama",
      ollamaMode: "local",
      fetchedOllamaModels: ["qwen2.5-coder:14b", "llama3.2"],
    });
    assert.deepEqual(list, ["qwen2.5-coder:14b", "llama3.2"]);
  });

  it("uses cloud starters when Ollama Cloud has no local fetch", () => {
    const list = resolveModelChoices({
      provider: "ollama",
      ollamaMode: "cloud",
      fetchedOllamaModels: [],
    });
    assert.ok(list.includes("gpt-oss:20b"));
  });
});

describe("withCurrentModelOption / coerceModelToChoices", () => {
  it("surfaces a saved orphan once", () => {
    assert.deepEqual(withCurrentModelOption(["a", "b"], "orphan"), [
      "orphan",
      "a",
      "b",
    ]);
  });

  it("coerces unknown values onto the first choice", () => {
    assert.equal(coerceModelToChoices("nope", ["a", "b"]), "a");
    assert.equal(coerceModelToChoices("b", ["a", "b"]), "b");
  });

  it("defaults match catalog heads", () => {
    assert.equal(defaultModelForProviderSelect("openrouter"), "openai/gpt-4o-mini");
    assert.equal(defaultModelForProviderSelect("anthropic"), "claude-3-5-haiku-latest");
  });
});
