import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateProductionSecurityConfig } from "../security-config";
import { getSandboxProvider, SandboxError } from "./index";

const secureProduction = {
  NODE_ENV: "production",
  ENCRYPTION_KEY: "a-secure-encryption-key-with-at-least-32-characters",
  PREVIEW_TOKEN_SECRET: "a-separate-preview-secret-with-at-least-32-characters",
  NEXT_PUBLIC_APP_URL: "https://app.example",
  PREVIEW_ORIGIN: "https://preview.example",
} as const;

describe("sandbox provider registry", () => {
  it("defaults to disabled in production", async () => {
    const provider = getSandboxProvider({ NODE_ENV: "production" });
    assert.equal(provider.kind, "disabled");
    await assert.rejects(
      provider.create({ files: [] }),
      (error: unknown) => error instanceof SandboxError && error.code === "SANDBOX_DISABLED",
    );
  });

  it("requires explicit production approval for local execution", () => {
    assert.throws(
      () =>
        validateProductionSecurityConfig({
          ...secureProduction,
          SANDBOX_ENABLED: "true",
        }),
      /ALLOW_LOCAL_SANDBOX_IN_PRODUCTION/,
    );
    assert.doesNotThrow(() =>
      validateProductionSecurityConfig({
        ...secureProduction,
        SANDBOX_PROVIDER: "local",
      }),
    );
    assert.doesNotThrow(() =>
      validateProductionSecurityConfig({
        ...secureProduction,
        SANDBOX_ENABLED: "true",
        SANDBOX_PROVIDER: "hosted",
      }),
    );
    assert.doesNotThrow(() =>
      validateProductionSecurityConfig({
        ...secureProduction,
        SANDBOX_ENABLED: "true",
        SANDBOX_PROVIDER: "local",
        ALLOW_LOCAL_SANDBOX_IN_PRODUCTION: "true",
      }),
    );
  });

  it("exposes hosted provider as a structured not-configured error", async () => {
    const provider = getSandboxProvider({
      NODE_ENV: "development",
      SANDBOX_ENABLED: "true",
      SANDBOX_PROVIDER: "hosted",
    });
    assert.equal(provider.kind, "hosted");
    await assert.rejects(
      provider.create({ files: [] }),
      (error: unknown) =>
        error instanceof SandboxError && error.code === "SANDBOX_NOT_CONFIGURED",
    );
  });
});
