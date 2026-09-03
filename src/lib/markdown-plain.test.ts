import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { plainTextFromMarkdown } from "./markdown-plain";

describe("plainTextFromMarkdown", () => {
  it("strips headings and bold for list previews", () => {
    const text = plainTextFromMarkdown("## **Conclusion**\n\nThe **PulseBoard** app is ready.");
    assert.equal(text.includes("##"), false);
    assert.equal(text.includes("**"), false);
    assert.match(text, /Conclusion/);
    assert.match(text, /PulseBoard/);
  });
});
