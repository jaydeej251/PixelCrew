import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  providerKeyFormatError,
  resolveApiKey,
  shouldInheritRunBrain,
  uniqueRosterProviders,
} from "./run-setup";

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

  it("rejects Anthropic keys that are not sk-ant-…", () => {
    assert.match(String(providerKeyFormatError("anthropic", "sk-bad")), /sk-ant/);
  });

  it("accepts well-formed Anthropic keys", () => {
    assert.equal(
      providerKeyFormatError("anthropic", "sk-ant-api03-abcdefghijklmnopqrstuvwxyz"),
      null,
    );
  });
});

describe("per-teammate brains helpers", () => {
  it("only mock seats inherit the run default", () => {
    assert.equal(shouldInheritRunBrain("mock"), true);
    assert.equal(shouldInheritRunBrain("openrouter"), false);
    assert.equal(shouldInheritRunBrain("anthropic"), false);
  });

  it("collects unique providers used on the roster", () => {
    assert.deepEqual(
      uniqueRosterProviders([
        { provider: "openrouter" },
        { provider: "anthropic" },
        { provider: "openrouter" },
      ]),
      ["openrouter", "anthropic"],
    );
  });
});
