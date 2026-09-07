import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  readRunLlmPreference,
  resolveInitialRunLlm,
  runLlmPreferenceKey,
  writeRunLlmPreference,
} from "./run-llm-preference";

const memory = new Map<string, string>();

afterEach(() => {
  memory.clear();
  // @ts-expect-error test shim
  globalThis.window = undefined;
});

function installStorage() {
  const localStorage = {
    getItem(key: string) {
      return memory.has(key) ? memory.get(key)! : null;
    },
    setItem(key: string, value: string) {
      memory.set(key, value);
    },
    removeItem(key: string) {
      memory.delete(key);
    },
  };
  // @ts-expect-error test shim
  globalThis.window = { localStorage };
}

describe("run LLM preference", () => {
  it("keys preference per workspace", () => {
    assert.equal(runLlmPreferenceKey("ws_1"), "pixelcrew:run-llm:ws_1");
  });

  it("prefers saved picker over leftover agent OpenRouter brain", () => {
    installStorage();
    writeRunLlmPreference("ws_1", "ollama", "qwen2.5-coder:14b");
    assert.deepEqual(readRunLlmPreference("ws_1"), {
      provider: "ollama",
      model: "qwen2.5-coder:14b",
    });
    assert.deepEqual(
      resolveInitialRunLlm({
        workspaceId: "ws_1",
        agentProvider: "openrouter",
        agentModel: "openai/gpt-4o-mini",
      }),
      { provider: "ollama", model: "qwen2.5-coder:14b" },
    );
  });

  it("falls back to agent brain when nothing is saved", () => {
    installStorage();
    assert.deepEqual(
      resolveInitialRunLlm({
        workspaceId: "ws_1",
        agentProvider: "openrouter",
        agentModel: "openai/gpt-4o-mini",
      }),
      { provider: "openrouter", model: "openai/gpt-4o-mini" },
    );
  });
});
