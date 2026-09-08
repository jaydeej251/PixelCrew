import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHANGES_I_WANT_MARKER,
  followUpFixSystemPrompt,
  FOLLOW_UP_UI_TITLE,
  isFollowUpGoal,
  isFollowUpImplementTitle,
  mergeFollowUpChanges,
  parseFollowUpGoal,
  partitionIterateAsks,
  surgicalFollowUpPlan,
  FOLLOW_UP_IMPLEMENT_TITLE,
} from "./follow-up-goal";
import { canIterateOnRun } from "./run-iterate";

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

  it("accumulates Changes I want so older bugs stay open", () => {
    const first = mergeFollowUpChanges("Build TaskQuest", "fix drag");
    assert.match(first, /Build TaskQuest/);
    assert.match(first, /fix drag/);
    const second = mergeFollowUpChanges(first, "overhaul the ui");
    assert.match(second, /Build TaskQuest/);
    assert.match(second, /overhaul the ui/);
    assert.match(second, /fix drag/);
    assert.match(second, /Next request:/);
  });

  it("splits bug fix and UI refresh into separate asks", () => {
    const split = partitionIterateAsks(
      "cant move task from backlog to completed. also overhaul the ui",
    );
    assert.equal(split.wantsSplit, true);
    assert.match(split.bugText, /move|backlog/i);
    assert.match(split.uiText, /overhaul|ui/i);
    assert.equal(isFollowUpImplementTitle(FOLLOW_UP_UI_TITLE), true);
  });

  it("builds an auto-publish plan that includes the change list", async () => {
    const { evalPlanQuality } = await import("./plan-quality");
    const goal = `Build TaskQuest RPG.${CHANGES_I_WANT_MARKER}Fix inventory drawer only`;
    const plan = surgicalFollowUpPlan(goal);
    assert.match(plan, /Request changes/i);
    assert.match(plan, /inventory/i);
    assert.match(plan, /Out of scope/i);
    assert.equal(
      evalPlanQuality(plan, { ceoGoal: parseFollowUpGoal(goal).baseGoal }).passed,
      true,
    );
  });

  it("allows UI overhaul when the CEO asked for it", () => {
    const goal = `Build TaskQuest.${CHANGES_I_WANT_MARKER}overhaul the ui`;
    const plan = surgicalFollowUpPlan(goal);
    assert.match(plan, /UI\/visual refresh is requested/i);
    assert.doesNotMatch(plan, /No gratuitous redesign/);
  });
});

describe("same-chat iterate gate", () => {
  it("allows completed chats and previewable failed chats", () => {
    assert.equal(
      canIterateOnRun({
        status: "completed",
        ceoGoal: "Build TaskQuest",
        artifacts: [],
      }),
      true,
    );
    assert.equal(
      canIterateOnRun({
        status: "running",
        ceoGoal: "Build TaskQuest",
        artifacts: [],
      }),
      false,
    );
  });
});

describe("follow-up system prompt", () => {
  it("requires file fences and allows UI when asked", () => {
    const prompt = followUpFixSystemPrompt("Sam", "Engineer");
    assert.match(prompt, /at least one complete/);
    assert.match(prompt, /UI refresh/i);
    assert.match(prompt, /overhaul\/modern/i);
  });

  it("tells follow-up QA to fail on stub app.js and regressions", async () => {
    const { followUpQaSystemPrompt } = await import("./follow-up-goal");
    const prompt = followUpQaSystemPrompt("Quinn", "QA Engineer");
    assert.match(prompt, /regression/i);
    assert.match(prompt, /UI shell ready|shell stub/i);
  });
});
