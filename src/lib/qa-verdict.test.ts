import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countQaReworkRounds,
  INITIAL_QA_TITLE,
  isQaFixTitle,
  isQaReviewTitle,
  nextQaReworkRound,
  parseQaVerdict,
  qaFixTitle,
  qaRecheckTitle,
} from "./qa-verdict";

describe("parseQaVerdict", () => {
  it("reads PASS and the punch list", () => {
    const parsed = parseQaVerdict(
      "Verdict: PASS\n\n- nit: styles.css — unused class\n",
    );
    assert.equal(parsed.verdict, "PASS");
    assert.match(parsed.punchList, /unused class/);
  });

  it("reads FAIL case-insensitively", () => {
    const parsed = parseQaVerdict("verdict: fail\nblocker: missing form");
    assert.equal(parsed.verdict, "FAIL");
    assert.match(parsed.punchList, /missing form/);
  });

  it("returns UNKNOWN when verdict line is missing", () => {
    const parsed = parseQaVerdict("Looks good overall.");
    assert.equal(parsed.verdict, "UNKNOWN");
    assert.equal(parsed.punchList, "Looks good overall.");
  });

  it("returns UNKNOWN for empty output", () => {
    assert.equal(parseQaVerdict("").verdict, "UNKNOWN");
    assert.equal(parseQaVerdict(null).verdict, "UNKNOWN");
  });
});

describe("QA title helpers", () => {
  it("recognizes initial and recheck titles", () => {
    assert.equal(isQaReviewTitle(INITIAL_QA_TITLE), true);
    assert.equal(isQaReviewTitle(qaRecheckTitle(1)), true);
    assert.equal(isQaReviewTitle(qaFixTitle(1)), false);
  });

  it("counts unique fix rounds even when FE and BE both get a task", () => {
    const tasks = [
      { title: INITIAL_QA_TITLE },
      { title: qaFixTitle(1) },
      { title: qaFixTitle(1) },
      { title: qaRecheckTitle(1) },
      { title: qaFixTitle(2) },
    ];
    assert.equal(countQaReworkRounds(tasks), 2);
    assert.equal(nextQaReworkRound(tasks), 3);
    assert.equal(isQaFixTitle(qaFixTitle(2)), true);
  });
});
