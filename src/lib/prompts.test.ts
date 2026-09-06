import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  councilSystemPrompt,
  engineerSystemPrompt,
  plannerSystemPrompt,
  synthesizerSystemPrompt,
} from "./prompts";

const SHIP_MARKERS = ["addEventListener", 'type="module"', "javascript:void(0)"];

describe("stage-slim system prompts", () => {
  it("keeps the full ship bar on engineers", () => {
    const prompt = engineerSystemPrompt("Ada", "Engineer", "Build the static app");
    for (const marker of SHIP_MARKERS) {
      assert.match(prompt, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("does not put the full ship bar on council, synth, or planner", () => {
    const prompts = [
      councilSystemPrompt("Pat", "Product Manager", "project_manager"),
      synthesizerSystemPrompt("Avery"),
      plannerSystemPrompt("Avery", "Workspace AI"),
    ];
    for (const prompt of prompts) {
      for (const marker of SHIP_MARKERS) {
        assert.doesNotMatch(
          prompt,
          new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
          `unexpected ship marker ${marker}`,
        );
      }
    }
  });

  it("still tells synth/planner that v1 is static HTML/CSS/JS", () => {
    assert.match(synthesizerSystemPrompt("Avery"), /static HTML\/CSS\/JS/);
    assert.match(plannerSystemPrompt("Avery", "Workspace AI"), /static HTML\/CSS\/JS/);
  });
});
