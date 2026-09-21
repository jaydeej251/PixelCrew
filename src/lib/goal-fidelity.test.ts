import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  missingProductHints,
  productHintsFromGoal,
} from "./goal-fidelity";

describe("productHintsFromGoal", () => {
  it("keeps PixelFlow but ignores JavaScript stack words", () => {
    const goal =
      "Build a fully static node-based visual flow editor called PixelFlow with HTML CSS and JavaScript";
    const hints = productHintsFromGoal(goal);
    assert.ok(hints.includes("PixelFlow"));
    assert.ok(!hints.includes("JavaScript"));
  });

  it("passes fidelity when only the product name is present", () => {
    const goal =
      "Build PixelFlow with an infinite zoomable canvas using JavaScript";
    assert.deepEqual(
      missingProductHints("<h1>PixelFlow</h1>", goal),
      [],
    );
  });
});
