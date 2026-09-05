import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  OAuthError,
  type OAuthIdentity,
  type OAuthUserRepository,
  createOAuthState,
  oauthErrorMessage,
  resolveOAuthUser,
  verifyOAuthState,
} from "./oauth";

const env = process.env as Record<string, string | undefined>;
const originalAuthSecret = env.AUTH_SECRET;
const originalNodeEnv = env.NODE_ENV;

afterEach(() => {
  if (originalAuthSecret === undefined) delete env.AUTH_SECRET;
  else env.AUTH_SECRET = originalAuthSecret;
  if (originalNodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = originalNodeEnv;
});

function identity(overrides: Partial<OAuthIdentity> = {}): OAuthIdentity {
  return {
    provider: "google",
    providerAccountId: "google-sub-1",
    email: "ceo@example.com",
    emailVerified: true,
    name: "CEO",
    ...overrides,
  };
}

function memoryRepo(seed?: {
  accounts?: Array<{ provider: string; providerAccountId: string; userId: string }>;
  users?: Array<{ id: string; email: string }>;
}): OAuthUserRepository & {
  accounts: Array<{ provider: string; providerAccountId: string; userId: string }>;
  users: Array<{ id: string; email: string }>;
  created: Array<{ email: string; name: string | null; provider: string; providerAccountId: string }>;
} {
  const accounts = [...(seed?.accounts ?? [])];
  const users = [...(seed?.users ?? [])];
  const created: Array<{
    email: string;
    name: string | null;
    provider: string;
    providerAccountId: string;
  }> = [];

  return {
    accounts,
    users,
    created,
    async findByProviderAccount(provider, providerAccountId) {
      const hit = accounts.find(
        (a) => a.provider === provider && a.providerAccountId === providerAccountId,
      );
      return hit ? { userId: hit.userId } : null;
    },
    async findUserByEmail(email) {
      const hit = users.find((u) => u.email === email);
      return hit ? { id: hit.id } : null;
    },
    async linkAccount(userId, provider, providerAccountId) {
      accounts.push({ userId, provider, providerAccountId });
    },
    async createUser(input) {
      const userId = `user_${created.length + 1}`;
      users.push({ id: userId, email: input.email });
      accounts.push({
        userId,
        provider: input.provider,
        providerAccountId: input.providerAccountId,
      });
      created.push(input);
      return { userId, created: true };
    },
  };
}

describe("resolveOAuthUser", () => {
  it("returns an already-linked provider account", async () => {
    const repo = memoryRepo({
      accounts: [{ provider: "google", providerAccountId: "google-sub-1", userId: "u_existing" }],
    });

    const result = await resolveOAuthUser(identity(), repo);
    assert.equal(result.userId, "u_existing");
    assert.equal(result.created, false);
    assert.equal(repo.created.length, 0);
  });

  it("auto-links a verified email to an existing password user", async () => {
    const repo = memoryRepo({
      users: [{ id: "u_password", email: "ceo@example.com" }],
    });

    const result = await resolveOAuthUser(identity(), repo);
    assert.equal(result.userId, "u_password");
    assert.equal(result.created, false);
    assert.equal(repo.accounts.length, 1);
    assert.equal(repo.accounts[0]?.providerAccountId, "google-sub-1");
    assert.equal(repo.created.length, 0);
  });

  it("creates a new user when email is unknown", async () => {
    const repo = memoryRepo();
    const result = await resolveOAuthUser(identity({ provider: "github", providerAccountId: "42" }), repo);
    assert.equal(result.userId, "user_1");
    assert.equal(result.created, true);
    assert.equal(repo.created.length, 1);
    assert.equal(repo.created[0]?.email, "ceo@example.com");
    assert.equal(repo.created[0]?.provider, "github");
  });

  it("rejects missing email", async () => {
    await assert.rejects(
      () => resolveOAuthUser(identity({ email: "  " }), memoryRepo()),
      (err: unknown) => err instanceof OAuthError && err.code === "missing_email",
    );
  });

  it("rejects unverified email", async () => {
    await assert.rejects(
      () => resolveOAuthUser(identity({ emailVerified: false }), memoryRepo()),
      (err: unknown) => err instanceof OAuthError && err.code === "email_unverified",
    );
  });
});

describe("oauth state", () => {
  it("round-trips a signed state for the same provider", () => {
    env.NODE_ENV = "test";
    env.AUTH_SECRET = "unit-test-auth-secret-that-is-long-enough";

    const state = createOAuthState("google");
    assert.equal(verifyOAuthState("google", state, state), true);
    assert.equal(verifyOAuthState("github", state, state), false);
    assert.equal(verifyOAuthState("google", state, "tampered"), false);
  });
});

describe("oauthErrorMessage", () => {
  it("maps known codes and falls back for unknown ones", () => {
    assert.equal(oauthErrorMessage("access_denied"), "Sign-in was cancelled.");
    assert.match(oauthErrorMessage("rate_limited") ?? "", /Too many/i);
    assert.match(oauthErrorMessage("something_else") ?? "", /try again/i);
    assert.equal(oauthErrorMessage(null), null);
  });
});
