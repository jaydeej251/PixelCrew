import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateProductionSecurityConfig } from "./security-config";

describe("validateProductionSecurityConfig", () => {
  it("fails closed when production secrets or isolated origins are missing", () => {
    assert.throws(
      () => validateProductionSecurityConfig({ NODE_ENV: "production" }),
      /ENCRYPTION_KEY/,
    );
    assert.throws(
      () =>
        validateProductionSecurityConfig({
          NODE_ENV: "production",
          ENCRYPTION_KEY: "a-secure-encryption-key-with-at-least-32-characters",
          NEXT_PUBLIC_APP_URL: "https://app.example",
          PREVIEW_ORIGIN: "https://app.example",
        }),
      /must differ/,
    );
  });

  it("accepts distinct HTTPS origins and strong production secrets", () => {
    assert.doesNotThrow(() =>
      validateProductionSecurityConfig({
        NODE_ENV: "production",
        ENCRYPTION_KEY: "a-secure-encryption-key-with-at-least-32-characters",
        PREVIEW_TOKEN_SECRET: "a-separate-preview-secret-with-at-least-32-characters",
        NEXT_PUBLIC_APP_URL: "https://app.example",
        PREVIEW_ORIGIN: "https://preview.example",
      }),
    );
  });
});
