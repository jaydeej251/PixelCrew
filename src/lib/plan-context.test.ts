import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPlanAskMessages,
  truncateForPrompt,
  truncatePlanForPrompt,
} from "./plan-context";

describe("truncateForPrompt", () => {
  it("leaves short text alone", () => {
    assert.equal(truncateForPrompt("hello", 100), "hello");
  });

  it("marks overflow", () => {
    const out = truncateForPrompt("abcdefghijklmnopqrstuvwxyz", 20);
    assert.match(out, /\[truncated\]$/);
    assert.ok(out.length <= 20);
    assert.ok(out.startsWith("abc"));
  });
});

describe("truncatePlanForPrompt", () => {
  it("keeps earlier markdown sections when the plan is long", () => {
    const plan = [
      "# Goal\nBuild PixelSynth.",
      "# Stack\nStatic HTML/CSS/JS.",
      "# Features\n" + "x".repeat(5_000),
      "# Tasks\n- Engineer builds files",
    ].join("\n\n");
    const out = truncatePlanForPrompt(plan, 400);
    assert.match(out, /# Goal/);
    assert.match(out, /# Stack/);
    assert.doesNotMatch(out, /# Tasks/);
  });
});

describe("buildPlanAskMessages", () => {
  it("pins the current plan once and digests older council brainstorms", () => {
    const thread = [
      {
        role: "assistant" as const,
        speaker: "Workspace AI",
        content: "Staffed the council. " + "a".repeat(2_000),
      },
      {
        role: "assistant" as const,
        speaker: "Product",
        content: "Product notes. " + "b".repeat(2_000),
      },
      {
        role: "assistant" as const,
        speaker: "Combined plan",
        content: "# Goal\nPixelSynth studio.\n\n# Stack\nStatic HTML.",
      },
      { role: "user" as const, content: "Make the visualizer bigger." },
      {
        role: "assistant" as const,
        speaker: "Workspace AI",
        content: "Updated plan:\n# Goal\nBigger visualizer.",
      },
      { role: "user" as const, content: "Also add a metronome." },
    ];

    const messages = buildPlanAskMessages({
      systemPrompt: "You are Workspace AI.",
      thread,
      currentPlan: "# Goal\nPixelSynth studio with metronome.",
      ceoGoal: "Build PixelSynth",
    });

    assert.equal(messages[0]?.role, "system");
    assert.equal(messages[1]?.role, "user");
    const pinned = messages[1]?.content ?? "";
    assert.match(pinned, /Current combined plan/);
    assert.match(pinned, /PixelSynth studio with metronome/);
    assert.match(pinned, /Product digest/);
    assert.match(pinned, /\[truncated\]/);

    // Recent dialogue only — not the full Product brainstorm body again.
    const joined = messages.map((m) => m.content).join("\n");
    assert.equal((joined.match(/Product notes/g) ?? []).length, 1);
    assert.match(joined, /Also add a metronome/);
    const dialogueOnly = messages.slice(2).map((m) => m.content).join("\n");
    assert.doesNotMatch(dialogueOnly, /Staffed the council/);
  });

  it("omits older dialogue beyond the recent-turn window", () => {
    const thread = Array.from({ length: 10 }, (_, i) =>
      i % 2 === 0
        ? { role: "user" as const, content: `Q${i}` }
        : {
            role: "assistant" as const,
            speaker: "Workspace AI",
            content: `A${i}`,
          },
    );

    const messages = buildPlanAskMessages({
      systemPrompt: "sys",
      thread,
      currentPlan: "# Goal\nX",
    });

    const dialogue = messages.slice(2).map((m) => m.content).join("\n");
    assert.match(dialogue, /Q8/);
    assert.match(dialogue, /A9/);
    assert.doesNotMatch(dialogue, /\bQ0\b/);
    assert.match(messages[1]?.content ?? "", /earlier Q&A/);
  });
});
