import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTrustedMutationRequest } from "./request-security";

describe("isTrustedMutationRequest", () => {
  it("accepts safe methods and same-origin mutations", () => {
    assert.equal(
      isTrustedMutationRequest(new Request("https://app.example/api/runs")),
      true,
    );
    assert.equal(
      isTrustedMutationRequest(
        new Request("https://app.example/api/runs", {
          method: "POST",
          headers: { origin: "https://app.example", "sec-fetch-site": "same-origin" },
        }),
      ),
      true,
    );
  });

  it("rejects cross-site, mismatched, and malformed origins", () => {
    for (const headers of [
      { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
      { origin: "https://evil.example", "sec-fetch-site": "same-origin" },
      { origin: "not a url", "sec-fetch-site": "same-origin" },
    ]) {
      assert.equal(
        isTrustedMutationRequest(
          new Request("https://app.example/api/runs", { method: "POST", headers }),
        ),
        false,
      );
    }
  });

  it("allows non-browser clients without browser security headers", () => {
    assert.equal(
      isTrustedMutationRequest(
        new Request("https://app.example/api/runs", { method: "POST" }),
      ),
      true,
    );
  });

  it("rejects a forged production Host even with the configured Origin", () => {
    const request = new Request("https://evil.example/api/runs", {
      method: "POST",
      headers: {
        origin: "https://app.example",
        "sec-fetch-site": "same-origin",
      },
    });
    assert.equal(
      isTrustedMutationRequest(request, {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://app.example",
      }),
      false,
    );
  });
});
