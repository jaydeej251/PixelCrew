import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeNewRunGoal } from "./run-goal";

describe("normalizeNewRunGoal", () => {
  it("requires an explicit non-empty goal for a new run", () => {
    assert.equal(normalizeNewRunGoal(undefined), null);
    assert.equal(normalizeNewRunGoal(null), null);
    assert.equal(normalizeNewRunGoal("   "), null);
  });

  it("trims and preserves the goal submitted for this run", () => {
    assert.equal(
      normalizeNewRunGoal("  Build MoodLedger, not a portfolio.  "),
      "Build MoodLedger, not a portfolio.",
    );
  });
});
