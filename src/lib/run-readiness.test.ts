import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRunReadinessSteps,
  preferReadyProvider,
  providerRequiresLiveKeyTest,
  providerTestStorageKey,
} from "./run-readiness";
import { OLLAMA_CLOUD_BASE_URL, OLLAMA_LOCAL_BASE_URL } from "./ollama-endpoints";

describe("run readiness", () => {
  it("requires live key test for OpenRouter, Anthropic, and Ollama Cloud", () => {
    assert.equal(providerRequiresLiveKeyTest("openrouter", null), true);
    assert.equal(providerRequiresLiveKeyTest("anthropic", null), true);
    assert.equal(providerRequiresLiveKeyTest("ollama", "cloud"), true);
    assert.equal(providerRequiresLiveKeyTest("ollama", "local"), false);
    assert.equal(providerRequiresLiveKeyTest("mock", null), false);
    assert.equal(providerRequiresLiveKeyTest("google", null), false);
  });

  it("prefers ready Ollama over mock", () => {
    const pick = preferReadyProvider(
      [
        {
          provider: "mock",
          label: "Mock",
          ready: true,
          source: "none",
          defaultModel: "mock",
        },
        {
          provider: "ollama",
          label: "Ollama",
          ready: true,
          source: "credential",
          defaultModel: "llama3.2",
          activeBaseUrl: OLLAMA_CLOUD_BASE_URL,
          activeCredentialId: "cred-1",
        },
      ],
      "mock",
    );
    assert.deepEqual(pick, { provider: "ollama", model: "gpt-oss:20b" });
  });

  it("leaves a non-mock provider alone", () => {
    assert.equal(
      preferReadyProvider(
        [
          {
            provider: "ollama",
            label: "Ollama",
            ready: true,
            source: "credential",
            defaultModel: "llama3.2",
            activeBaseUrl: OLLAMA_LOCAL_BASE_URL,
          },
        ],
        "openrouter",
      ),
      null,
    );
  });

  it("blocks Start until cloud key test passes", () => {
    const status = {
      provider: "ollama",
      label: "Ollama",
      ready: true,
      source: "credential" as const,
      defaultModel: "gpt-oss:20b",
      activeBaseUrl: OLLAMA_CLOUD_BASE_URL,
      activeCredentialId: "c1",
      activeCredentialLabel: "Cloud",
    };
    const blocked = buildRunReadinessSteps({
      provider: "ollama",
      model: "gpt-oss:20b",
      status,
      testOk: false,
    });
    assert.equal(blocked.canStart, false);
    assert.ok(blocked.steps.some((s) => s.id === "test" && !s.done));

    const ready = buildRunReadinessSteps({
      provider: "ollama",
      model: "gpt-oss:20b",
      status,
      testOk: true,
    });
    assert.equal(ready.canStart, true);
  });

  it("allows local Ollama without a key test", () => {
    const local = buildRunReadinessSteps({
      provider: "ollama",
      model: "llama3.2",
      status: {
        provider: "ollama",
        label: "Ollama",
        ready: true,
        source: "none",
        defaultModel: "llama3.2",
        activeBaseUrl: OLLAMA_LOCAL_BASE_URL,
      },
      testOk: false,
    });
    assert.equal(local.canStart, true);
    assert.equal(local.steps.some((s) => s.id === "test"), false);
  });

  it("builds stable session storage keys", () => {
    assert.equal(
      providerTestStorageKey("ws", "ollama", "cred"),
      "pixelcrew:provider-test-ok:ws:ollama:cred",
    );
    assert.equal(
      providerTestStorageKey("ws", "openrouter", null),
      "pixelcrew:provider-test-ok:ws:openrouter:env",
    );
  });
});
