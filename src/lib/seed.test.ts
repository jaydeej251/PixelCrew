import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

const env = process.env as Record<string, string | undefined>;
const keys = [
  "NODE_ENV",
  "ALLOW_DB_SEED",
  "SEED_FREE_EMAIL",
  "SEED_FREE_PASSWORD",
  "SEED_PRO_EMAIL",
  "SEED_PRO_PASSWORD",
  "SEED_ADMIN_EMAIL",
  "SEED_ADMIN_PASSWORD",
] as const;
const originals: Record<string, string | undefined> = {};
for (const key of keys) originals[key] = env[key];

afterEach(() => {
  for (const key of keys) {
    if (originals[key] === undefined) delete env[key];
    else env[key] = originals[key];
  }
});

describe("seedDatabase env guards", () => {
  it("blocks production without ALLOW_DB_SEED", async () => {
    env.NODE_ENV = "production";
    delete env.ALLOW_DB_SEED;
    // Fresh import path is not required; mutate env before call.
    const { seedDatabase } = await import("./seed");
    await assert.rejects(() => seedDatabase(), /blocked in production/i);
  });

  it("returns a helpful message when no seed pairs are set", async () => {
    env.NODE_ENV = "development";
    delete env.ALLOW_DB_SEED;
    for (const key of keys.slice(2)) delete env[key];
    const { seedDatabase } = await import("./seed");
    const result = await seedDatabase();
    assert.equal(result.accounts.length, 0);
    assert.match(result.message, /No SEED_/);
  });
});
