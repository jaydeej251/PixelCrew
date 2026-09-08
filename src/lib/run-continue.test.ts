import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHANGES_I_WANT_MARKER, isFollowUpGoal, parseFollowUpGoal } from "./follow-up-goal";
import {
  CONTINUE_CARRY_HINT,
  buildCarryForwardSummary,
  buildContinueCarryGoal,
  defaultContinueChangesDraft,
  listShippedCodePaths,
  seedCarryForwardArtifacts,
  CARRY_FORWARD_SUMMARY_TITLE,
} from "./run-continue";
import { INITIAL_QA_TITLE } from "./qa-verdict";

describe("run-continue carry-forward", () => {
  it("lists shipped code paths only", () => {
    const paths = listShippedCodePaths([
      { type: "code", filePath: "index.html", content: "<html></html>" },
      { type: "code", filePath: "app.js", content: "console.log(1)" },
      { type: "prd", filePath: null, content: "plan" },
      { type: "code", filePath: "../evil.js", content: "x" },
    ]);
    assert.deepEqual(paths, ["app.js", "index.html"]);
  });

  it("builds a compact summary with QA punch list", () => {
    const summary = buildCarryForwardSummary({
      artifacts: [
        { type: "code", filePath: "index.html", content: "<html></html>" },
        { type: "code", filePath: "app.js", content: "x".repeat(50) },
      ],
      tasks: [
        {
          title: INITIAL_QA_TITLE,
          output: "Verdict: FAIL\n- [MISSING] click listener on #add-node",
        },
      ],
      runError: "QA still FAIL after 4 fix rounds — files kept.",
    });
    assert.match(summary, /index\.html/);
    assert.match(summary, /Latest QA: FAIL/);
    assert.match(summary, /#add-node/);
    assert.match(summary, /4 fix rounds/);
  });

  it("builds a follow-up goal that stays on the surgical path", () => {
    const goal = buildContinueCarryGoal({
      baseGoal: "Build PixelFlow node editor",
      changes: "Wire create-node and drag",
      summary: "Shipped files (2): app.js, index.html",
    });
    assert.equal(isFollowUpGoal(goal), true);
    assert.match(goal, /PixelFlow/);
    assert.match(goal, /Wire create-node/);
    assert.match(goal, new RegExp(CONTINUE_CARRY_HINT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const parsed = parseFollowUpGoal(goal);
    assert.equal(parsed.isFollowUp, true);
    assert.match(parsed.baseGoal, /PixelFlow/);
    assert.match(parsed.changes, /Requested now/);
    assert.match(parsed.changes, /create-node/);
    assert.ok(goal.includes(CHANGES_I_WANT_MARKER.trim()));
  });

  it("prefills continue draft from failing QA punch list", () => {
    const draft = defaultContinueChangesDraft({
      artifacts: [{ type: "code", filePath: "app.js", content: "stub" }],
      tasks: [
        {
          title: "QA recheck (round 2)",
          output: "Verdict: FAIL\n- [MISSING] drag handlers",
        },
      ],
      runError: "Token spend limit",
    });
    assert.match(draft, /punch|MISSING|drag/i);
    assert.match(draft, /do not redesign/i);
  });

  it("seeds code plus carry summary artifact rows", () => {
    const rows = seedCarryForwardArtifacts({
      parentRunId: "parent-1",
      priorCode: [
        {
          type: "code",
          title: "index.html",
          content: "<html></html>",
          filePath: "index.html",
        },
      ],
      summary: "Shipped files (1): index.html",
    });
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.filePath, "index.html");
    assert.equal(rows[1]!.title, CARRY_FORWARD_SUMMARY_TITLE);
    assert.match(rows[1]!.content, /index\.html/);
  });
});
