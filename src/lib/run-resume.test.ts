import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPlanCheckpoint,
  isPublishedPlan,
  isResumable,
  resumePhase,
  shouldRequeueTask,
} from "./run-resume";

describe("isResumable", () => {
  it("treats user stop (cancelled) as resumable on the same run", () => {
    assert.equal(
      isResumable({
        status: "cancelled",
        tasks: [{ status: "in_progress" }, { status: "queued" }],
      }),
      true,
    );
  });

  it("treats mid-work failure as resumable", () => {
    assert.equal(
      isResumable({
        status: "failed",
        tasks: [{ status: "done" }, { status: "failed" }],
      }),
      true,
    );
  });

  it("does not treat the CEO plan checkpoint as a user-stop resume", () => {
    assert.equal(isPlanCheckpoint("paused"), true);
    assert.equal(
      isResumable({
        status: "paused",
        tasks: [{ status: "done" }],
        artifacts: [{ title: "Plan Q&A" }],
      }),
      false,
    );
  });

  it("does not resume a finished or in-flight run", () => {
    assert.equal(isResumable({ status: "completed", tasks: [{ status: "done" }] }), false);
    assert.equal(isResumable({ status: "running", tasks: [{ status: "queued" }] }), false);
    assert.equal(isResumable({ status: "pending", tasks: [] }), false);
  });

  it("allows resume when stop happened before any tasks were seeded", () => {
    assert.equal(isResumable({ status: "cancelled", tasks: [] }), true);
  });
});

describe("resumePhase", () => {
  it("resumes planning when the CEO has not published yet", () => {
    assert.equal(resumePhase([{ title: "Plan Q&A" }]), "planning");
    assert.equal(isPublishedPlan([{ title: "Plan Q&A" }]), false);
  });

  it("resumes build after the plan is published", () => {
    assert.equal(resumePhase([{ title: "Plan published" }]), "build");
    assert.equal(isPublishedPlan([{ title: "Plan published" }]), true);
  });
});

describe("shouldRequeueTask", () => {
  it("retries claimed, in-progress, and failed work, not done or blocked", () => {
    assert.equal(shouldRequeueTask("claimed"), true);
    assert.equal(shouldRequeueTask("in_progress"), true);
    assert.equal(shouldRequeueTask("failed"), true);
    assert.equal(shouldRequeueTask("queued"), false);
    assert.equal(shouldRequeueTask("done"), false);
    assert.equal(shouldRequeueTask("blocked"), false);
  });
});
