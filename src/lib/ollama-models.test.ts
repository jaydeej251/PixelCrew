import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OLLAMA_CLOUD_BASE_URL,
  OLLAMA_LOCAL_BASE_URL,
} from "./ollama-endpoints";
import {
  getOllamaDefaultModelForMode,
  getOllamaEndpointMode,
  getOllamaSuggestedModels,
  looksLikeIncompleteOllamaApiKey,
  ollamaModelHasLocalCloudSuffix,
  ollamaModelLooksMismatched,
} from "./ollama-models";

describe("ollama model UX helpers", () => {
  it("maps base URLs to endpoint modes", () => {
    assert.equal(getOllamaEndpointMode(OLLAMA_CLOUD_BASE_URL), "cloud");
    assert.equal(getOllamaEndpointMode(OLLAMA_LOCAL_BASE_URL), "local");
    assert.equal(getOllamaEndpointMode("https://my-box.example/v1"), "custom");
    assert.equal(getOllamaEndpointMode(null), null);
  });

  it("returns catalog starters for cloud and local", () => {
    assert.ok(getOllamaSuggestedModels("cloud").includes("gpt-oss:20b"));
    assert.ok(getOllamaSuggestedModels("local").includes("llama3.2"));
    assert.deepEqual(getOllamaSuggestedModels("custom"), []);
    assert.equal(getOllamaDefaultModelForMode("cloud"), "gpt-oss:20b");
    assert.equal(getOllamaDefaultModelForMode("local"), "llama3.2");
  });

  it("flags soft mismatches against the other catalog", () => {
    assert.equal(ollamaModelLooksMismatched("qwen2.5-coder:14b", "cloud"), true);
    assert.equal(ollamaModelLooksMismatched("gpt-oss:20b", "local"), true);
    assert.equal(ollamaModelLooksMismatched("gpt-oss:20b", "cloud"), false);
    assert.equal(ollamaModelLooksMismatched("custom-finetune", "cloud"), false);
  });

  it("treats -cloud suffix as a local offload name, not direct API", () => {
    assert.equal(ollamaModelHasLocalCloudSuffix("gpt-oss:120b-cloud"), true);
    assert.equal(ollamaModelHasLocalCloudSuffix("gpt-oss:120b"), false);
    assert.equal(ollamaModelLooksMismatched("gpt-oss:120b-cloud", "cloud"), true);
  });

  it("detects incomplete Ollama Cloud API keys missing the secret suffix", () => {
    assert.equal(looksLikeIncompleteOllamaApiKey("d2af7ef1c07844a69e8511b4a380f644"), true);
    assert.equal(
      looksLikeIncompleteOllamaApiKey("39dff158413140048030ee3e8e7ca99f.secret-suffix"),
      false,
    );
  });
});
