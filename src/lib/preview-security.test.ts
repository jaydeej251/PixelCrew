import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { previewSecurityHeaders } from "./preview-security";

describe("previewSecurityHeaders", () => {
  it("forces generated documents into a restricted sandbox", () => {
    const headers = previewSecurityHeaders(
      "text/html; charset=utf-8",
      "https://app.example/api/previews/signed-token/",
      "https://app.example",
    );
    const csp = headers["Content-Security-Policy"];

    assert.equal(headers["Content-Type"], "text/html; charset=utf-8");
    assert.match(csp, /sandbox allow-scripts allow-forms/);
    assert.doesNotMatch(csp, /allow-same-origin/);
    assert.match(csp, /connect-src 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /form-action 'none'/);
    assert.match(csp, /https:\/\/app\.example\/api\/previews\/signed-token\//);
  });

  it("prevents caching, referrer leakage, and browser capability access", () => {
    const headers = previewSecurityHeaders("application/javascript; charset=utf-8");

    assert.match(headers["Cache-Control"], /no-store/);
    assert.equal(headers["Referrer-Policy"], "no-referrer");
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.match(headers["Permissions-Policy"], /camera=\(\)/);
    assert.match(headers["Permissions-Policy"], /payment=\(\)/);
  });
});
