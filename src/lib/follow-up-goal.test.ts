import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHANGES_I_WANT_MARKER,
  followUpFixSystemPrompt,
  isFollowUpGoal,
  isFollowUpImplementTitle,
  parseFollowUpGoal,
  surgicalFollowUpPlan,
  FOLLOW_UP_IMPLEMENT_TITLE,
} from "./follow-up-goal";

describe("follow-up goal parsing", () => {
  it("detects Request changes goals", () => {
    const goal = `Build TaskQuest.${CHANGES_I_WANT_MARKER}Fix inventory drawer`;
    assert.equal(isFollowUpGoal(goal), true);
    assert.equal(isFollowUpGoal("Build TaskQuest"), false);
    const parsed = parseFollowUpGoal(goal);
    assert.equal(parsed.isFollowUp, true);
    assert.match(parsed.baseGoal, /TaskQuest/);
    assert.match(parsed.changes, /inventory/);
  });

  it("recognizes apply-changes implement title", () => {
    assert.equal(isFollowUpImplementTitle(FOLLOW_UP_IMPLEMENT_TITLE), true);
    assert.equal(isFollowUpImplementTitle("Implement product work from the plan"), false);
  });

  it("builds an auto-publish surgical plan that stays patch-scoped", async () => {
    const { evalPlanQuality } = await import("./plan-quality");
    const goal = `Build TaskQuest RPG.${CHANGES_I_WANT_MARKER}Fix inventory drawer only`;
    const plan = surgicalFollowUpPlan(goal);
    assert.match(plan, /surgical/i);
    assert.match(plan, /inventory/i);
    assert.match(plan, /Out of scope/i);
    assert.equal(
      evalPlanQuality(plan, { ceoGoal: parseFollowUpGoal(goal).baseGoal }).passed,
      true,
    );
  });
});
