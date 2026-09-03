import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isMilestoneEvent, joinedThinking, type RunEventMessage } from "./events";
import {
  attemptKey,
  boundedText,
  executionKey,
  isLegalAttemptTransition,
  isLegalExecutionTransition,
  isLegalToolTransition,
  milestoneProjection,
  milestoneTypeForRecord,
  sanitizeExecutionData,
  toolEventKey,
  validateWorkspaceKey,
} from "./execution-runtime";

describe("execution runtime keys", () => {
  it("is stable and does not confuse embedded separators", () => {
    assert.equal(executionKey("run-1", "task-1"), executionKey("run-1", "task-1"));
    assert.notEqual(executionKey("a|b", "c"), executionKey("a", "b|c"));
    assert.notEqual(attemptKey("execution-1", "resume-1"), toolEventKey("execution-1", "resume-1"));
  });
});

describe("execution lifecycle guards", () => {
  it("permits retries while protecting terminal attempt and tool history", () => {
    assert.equal(isLegalExecutionTransition("running", "completed"), true);
    assert.equal(isLegalExecutionTransition("completed", "pending"), true);
    assert.equal(isLegalExecutionTransition("completed", "running"), false);
    assert.equal(isLegalAttemptTransition("starting", "running"), true);
    assert.equal(isLegalAttemptTransition("completed", "running"), false);
    assert.equal(isLegalToolTransition("requested", "running"), true);
    assert.equal(isLegalToolTransition("completed", "failed"), false);
  });
});

describe("persisted execution data", () => {
  it("redacts secret-looking fields and bounds collections and text", () => {
    const sanitized = sanitizeExecutionData({
      authorization: "Bearer private",
      nested: { apiKey: "private", safe: "visible" },
      many: Array.from({ length: 120 }, (_, index) => index),
    }) as Record<string, unknown>;

    assert.equal(sanitized.authorization, "[REDACTED]");
    assert.deepEqual(sanitized.nested, { apiKey: "[REDACTED]", safe: "visible" });
    assert.equal((sanitized.many as unknown[]).length, 101);
    assert.match(boundedText("x".repeat(9_000)) ?? "", /\[truncated\]$/);
  });

  it("rejects cyclic objects", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    assert.throws(() => sanitizeExecutionData(cyclic), /cycles/);
  });

  it("accepts opaque workspace IDs but rejects host paths", () => {
    assert.equal(validateWorkspaceKey("e2b:workspace_123"), "e2b:workspace_123");
    assert.throws(() => validateWorkspaceKey("/Users/person/project"), /opaque/);
    assert.throws(() => validateWorkspaceKey("../project"), /opaque/);
  });
});

describe("milestone projection", () => {
  it("maps durable statuses to the minimal UI milestone types", () => {
    assert.equal(milestoneTypeForRecord("execution", "running"), "EXECUTION_STARTED");
    assert.equal(milestoneTypeForRecord("tool_event", "failed"), "TOOL_FAILED");
    assert.equal(milestoneTypeForRecord("check_result", "passed"), "CHECK_PASSED");
    assert.equal(milestoneTypeForRecord("approval", "approved"), "APPROVAL_RESOLVED");
    assert.equal(milestoneTypeForRecord("attempt", "running"), null);
  });

  it("strips tool inputs and outputs from the RunEvent projection", () => {
    const event = milestoneProjection({
      runId: "run-1",
      type: "TOOL_COMPLETED",
      sourceKind: "tool_event",
      sourceId: "tool-1",
      payload: {
        taskId: "task-1",
        toolName: "write_file",
        input: { path: "/host/private" },
        output: "raw output",
        summary: "Updated one file",
      },
    });

    assert.deepEqual(event.payload, {
      taskId: "task-1",
      toolName: "write_file",
      summary: "Updated one file",
    });
  });
});

describe("legacy event compatibility", () => {
  it("continues to classify and replay events without source fields", () => {
    const events: RunEventMessage[] = [
      {
        id: "old-1",
        type: "TASK_STARTED",
        payload: { taskId: "task-1", taskTitle: "Legacy task" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "old-2",
        type: "AGENT_THINKING",
        payload: { message: "Still works" },
        createdAt: "2026-01-01T00:00:01.000Z",
      },
    ];

    assert.equal(isMilestoneEvent(events[0].type), true);
    assert.equal(isMilestoneEvent(events[1].type), false);
    assert.equal(isMilestoneEvent("EXECUTION_STARTED"), false);
    assert.equal(joinedThinking(events), "Still works");
  });
});
