import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { decrypt, encrypt } from "./crypto";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = env.NODE_ENV;
const originalEncryptionKey = env.ENCRYPTION_KEY;

afterEach(() => {
  if (originalNodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = originalNodeEnv;
  if (originalEncryptionKey === undefined) delete env.ENCRYPTION_KEY;
  else env.ENCRYPTION_KEY = originalEncryptionKey;
});

describe("credential encryption", () => {
  it("round-trips credentials with a configured key", () => {
    env.NODE_ENV = "test";
    env.ENCRYPTION_KEY = "test-key-that-is-long-enough-for-credential-encryption";

    const encrypted = encrypt("sk-example-secret");
    assert.notEqual(encrypted, "sk-example-secret");
    assert.equal(decrypt(encrypted), "sk-example-secret");
  });

  it("rejects the repository fallback key in production", () => {
    env.NODE_ENV = "production";
    delete env.ENCRYPTION_KEY;

    assert.throws(
      () => encrypt("sk-example-secret"),
      /ENCRYPTION_KEY must be a unique secret/,
    );
  });
});
