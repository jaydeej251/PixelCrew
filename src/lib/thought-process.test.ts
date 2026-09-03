import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildThoughtProcess, streamsFromEvents } from "./thought-process";
import type { RunEventMessage } from "./events";

function ev(
  partial: Partial<RunEventMessage> & { type: RunEventMessage["type"] },
): RunEventMessage {
  return {
    id: partial.id ?? `e-${Math.random().toString(36).slice(2, 7)}`,
    type: partial.type,
    payload: partial.payload ?? {},
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
    agentId: partial.agentId,
  };
}

describe("buildThoughtProcess", () => {
  it("pairs your goal with each teammate brief and what they wrote", () => {
    const events = [
      ev({
        type: "TASK_STARTED",
        agentId: "a1",
        payload: {
          agentId: "a1",
          agentName: "Alex",
          taskId: "t1",
          taskTitle: "Product brainstorm",
          brief: "Scope a static portfolio for the CEO.",
        },
      }),
      ev({
        type: "AGENT_THINKING",
        agentId: "a1",
        payload: { agentId: "a1", taskId: "t1", message: "Users need a clear hero.\n" },
      }),
      ev({
        type: "AGENT_THINKING",
        agentId: "a1",
        payload: { agentId: "a1", taskId: "t1", message: "Then a projects grid." },
      }),
      ev({
        type: "AGENT_TASK_DONE",
        agentId: "a1",
        payload: { agentId: "a1", taskId: "t1", taskTitle: "Product brainstorm" },
      }),
    ];

    const process = buildThoughtProcess({
      ceoGoal: "Build my portfolio",
      tasks: [
        {
          id: "t1",
          title: "Product brainstorm",
          description: "Fallback brief",
          status: "done",
          position: "project_manager",
          output: "## Plan\nHero + projects",
          claimedById: "a1",
          completedAt: "2026-01-01T00:01:00.000Z",
        },
      ],
      events,
      agents: [{ id: "a1", name: "Alex Chen" }],
    });

    assert.equal(process.ceoGoal, "Build my portfolio");
    assert.equal(process.steps.length, 1);
    assert.equal(process.steps[0]!.brief, "Scope a static portfolio for the CEO.");
    assert.equal(process.steps[0]!.thinking, "Users need a clear hero.\nThen a projects grid.");
    assert.match(process.steps[0]!.result, /Hero/);
    assert.equal(process.steps[0]!.agentName, "Alex Chen");
  });

  it("falls back to task description when no brief was stored", () => {
    const process = buildThoughtProcess({
      ceoGoal: "Ship a todo app",
      tasks: [
        {
          id: "t2",
          title: "Build UI",
          description: "Write index.html",
          status: "done",
          position: "engineer",
          output: "```file:index.html\n<html></html>\n```",
          claimedById: "e1",
          completedAt: "2026-01-01T00:02:00.000Z",
        },
      ],
      events: [],
      agents: [{ id: "e1", name: "Sam" }],
    });
    assert.match(process.steps[0]!.brief, /Build UI/);
    assert.match(process.steps[0]!.brief, /Write index.html/);
  });
});

describe("streamsFromEvents", () => {
  it("rebuilds per-agent drafts after reload", () => {
    const streams = streamsFromEvents([
      ev({
        type: "AGENT_THINKING",
        agentId: "a1",
        payload: { message: "Hello " },
      }),
      ev({
        type: "AGENT_THINKING",
        agentId: "a1",
        payload: { message: "world" },
      }),
      ev({
        type: "AGENT_THINKING",
        agentId: "a2",
        payload: { message: "Other" },
      }),
    ]);
    assert.equal(streams.a1, "Hello world");
    assert.equal(streams.a2, "Other");
  });
});
