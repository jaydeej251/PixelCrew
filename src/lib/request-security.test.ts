import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTrustedMutationRequest, resolvePublicRequestOrigin } from "./request-security";

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

  it("accepts production mutations behind a local reverse proxy (loopback URL)", () => {
    const request = new Request("http://127.0.0.1:3000/api/auth/login", {
      method: "POST",
      headers: {
        origin: "https://pixel-crew.online",
        "sec-fetch-site": "same-origin",
      },
    });
    assert.equal(
      isTrustedMutationRequest(request, {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://pixel-crew.online",
      }),
      true,
    );
  });

  it("accepts production mutations when X-Forwarded-* matches the app URL", () => {
    const request = new Request("http://127.0.0.1:3000/api/auth/login", {
      method: "POST",
      headers: {
        origin: "https://pixel-crew.online",
        "sec-fetch-site": "same-origin",
        "x-forwarded-host": "pixel-crew.online",
        "x-forwarded-proto": "https",
      },
    });
    assert.equal(
      isTrustedMutationRequest(request, {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://pixel-crew.online",
      }),
      true,
    );
  });

  it("rejects loopback production mutations whose Origin is not the app URL", () => {
    const request = new Request("http://127.0.0.1:3000/api/auth/login", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "sec-fetch-site": "same-origin",
      },
    });
    assert.equal(
      isTrustedMutationRequest(request, {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://pixel-crew.online",
      }),
      false,
    );
  });
});

describe("resolvePublicRequestOrigin", () => {
  it("prefers forwarded host and proto", () => {
    const request = new Request("http://127.0.0.1:3000/api/auth/login", {
      headers: {
        "x-forwarded-host": "pixel-crew.online",
        "x-forwarded-proto": "https",
      },
    });
    assert.equal(resolvePublicRequestOrigin(request), "https://pixel-crew.online");
  });
});
