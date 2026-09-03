import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPreviewToken, verifyPreviewToken } from "./preview-token";

describe("preview access tokens", () => {
  it("round-trips a run-scoped token before expiry", () => {
    const now = Date.UTC(2026, 8, 3);
    const token = createPreviewToken("run_123", now);

    assert.equal(verifyPreviewToken(token, now + 60_000)?.runId, "run_123");
  });

  it("rejects expired or modified tokens", () => {
    const now = Date.UTC(2026, 8, 3);
    const token = createPreviewToken("run_123", now);

    assert.equal(verifyPreviewToken(token, now + 6 * 60_000), null);
    assert.equal(verifyPreviewToken(`${token}changed`, now), null);
  });
});
