import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HQ_LAYOUT_NAME, isProtectedLayout } from "./office-layouts";

describe("isProtectedLayout", () => {
  it("protects flagged layouts and HQ by name", () => {
    assert.equal(isProtectedLayout({ name: "My office", isProtected: true }), true);
    assert.equal(isProtectedLayout({ name: HQ_LAYOUT_NAME, isProtected: false }), true);
    assert.equal(isProtectedLayout({ name: "hq", isProtected: false }), true);
    assert.equal(isProtectedLayout({ name: "My office", isProtected: false }), false);
  });
});
