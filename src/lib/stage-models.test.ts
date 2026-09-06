import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cheapPlanningModel,
  planningStageModelOverride,
} from "./stage-models";

describe("cheapPlanningModel", () => {
  it("maps cloud BYOK providers to a cheap planning default", () => {
    assert.equal(cheapPlanningModel("openrouter"), "openai/gpt-4o-mini");
    assert.equal(cheapPlanningModel("anthropic"), "claude-3-5-haiku-latest");
    assert.equal(cheapPlanningModel("google"), "gemini-2.0-flash");
    assert.equal(cheapPlanningModel("openai_compatible"), "gpt-4o-mini");
  });

  it("does not force a cheap override for ollama or mock", () => {
    assert.equal(cheapPlanningModel("ollama"), undefined);
    assert.equal(cheapPlanningModel("mock"), undefined);
  });
});

describe("planningStageModelOverride", () => {
  it("overrides dispatch when the run model is more expensive", () => {
    assert.equal(
      planningStageModelOverride("openrouter", "anthropic/claude-3.5-sonnet", "dispatch"),
      "openai/gpt-4o-mini",
    );
    assert.equal(
      planningStageModelOverride("anthropic", "claude-opus-4-20250514", "dispatch"),
      "claude-3-5-haiku-latest",
    );
  });

  it("does not override council, synth, or an already-cheap run model", () => {
    assert.equal(
      planningStageModelOverride("openrouter", "anthropic/claude-3.5-sonnet", "council"),
      null,
    );
    assert.equal(
      planningStageModelOverride("openrouter", "anthropic/claude-3.5-sonnet", "synth"),
      null,
    );
    assert.equal(
      planningStageModelOverride("openrouter", "anthropic/claude-3.5-sonnet", null),
      null,
    );
    assert.equal(
      planningStageModelOverride("openrouter", "openai/gpt-4o-mini", "dispatch"),
      null,
    );
  });

  it("leaves ollama on the run model", () => {
    assert.equal(
      planningStageModelOverride("ollama", "gpt-oss:20b", "dispatch"),
      null,
    );
  });
});
