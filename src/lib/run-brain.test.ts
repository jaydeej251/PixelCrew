import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RUN_BRAIN_TITLE,
  buildAutoHireConfirmPayload,
  parseRunBrain,
  providerDisplayLabel,
  resolveAutoHireBrain,
  serializeRunBrain,
} from "./run-brain";

describe("run brain", () => {
  it("round-trips Start picker through the run artifact", () => {
    const raw = serializeRunBrain({
      provider: "ollama",
      model: "gpt-oss:120b-cloud",
    });
    assert.match(raw, /ollama/);
    assert.deepEqual(parseRunBrain(raw), {
      provider: "ollama",
      model: "gpt-oss:120b-cloud",
    });
    assert.equal(RUN_BRAIN_TITLE, "Run brain");
  });

  it("prefers the Start brain over an empty roster (no OpenRouter hijack)", () => {
    assert.deepEqual(
      resolveAutoHireBrain({
        runBrain: { provider: "ollama", model: "llama3.2" },
        sample: null,
      }),
      { provider: "ollama", model: "llama3.2" },
    );
  });

  it("falls back to an existing seat when no run brain was stored", () => {
    assert.deepEqual(
      resolveAutoHireBrain({
        runBrain: null,
        sample: { provider: "anthropic", model: "claude-sonnet-4-5" },
      }),
      { provider: "anthropic", model: "claude-sonnet-4-5" },
    );
  });

  it("does not invent OpenRouter when both Start brain and roster are missing", () => {
    assert.deepEqual(resolveAutoHireBrain({ runBrain: null, sample: null }), {
      provider: "mock",
      model: "mock",
    });
  });

  it("builds an empty-roster confirm that names the Start brain (not OpenRouter)", () => {
    const payload = buildAutoHireConfirmPayload({
      provider: "ollama",
      model: "gpt-oss:120b-cloud",
    });
    assert.equal(payload.needsAutoHireConfirm, true);
    assert.equal(payload.autoHire.provider, "ollama");
    assert.equal(payload.autoHire.model, "gpt-oss:120b-cloud");
    assert.match(payload.error, /Ollama/);
    assert.match(payload.error, /gpt-oss:120b-cloud/);
    assert.doesNotMatch(payload.error, /OpenRouter/);
    assert.equal(providerDisplayLabel("ollama"), "Ollama (local or cloud)");
  });
});
