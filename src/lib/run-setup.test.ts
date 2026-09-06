import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { providerKeyFormatError, resolveApiKey } from "./run-setup";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = env.NODE_ENV;
const originalOpenRouterKey = env.OPENROUTER_API_KEY;

afterEach(() => {
  if (originalNodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = originalNodeEnv;
  if (originalOpenRouterKey === undefined) delete env.OPENROUTER_API_KEY;
  else env.OPENROUTER_API_KEY = originalOpenRouterKey;
});

describe("production provider key isolation", () => {
  it("never falls back to an operator-wide environment key in production", () => {
    env.NODE_ENV = "production";
    env.OPENROUTER_API_KEY = "sk-or-v1-shared-key-must-not-be-used";

    assert.deepEqual(resolveApiKey("openrouter", null), { source: "none" });
  });
});

describe("providerKeyFormatError", () => {
  it("rejects OpenRouter keys that are not sk-or-v1-…", () => {
    assert.match(
      String(providerKeyFormatError("openrouter", "sk-or-bad")),
      /sk-or-v1/,
    );
  });

  it("accepts well-formed OpenRouter keys", () => {
    assert.equal(
      providerKeyFormatError("openrouter", "sk-or-v1-abcdefghijklmnopqrstuvwxyz"),
      null,
    );
  });
});
