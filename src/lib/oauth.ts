import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "./db";
import { slugify } from "./utils";
import { createWorkspaceForUser } from "./workspace-bootstrap";

export const OAUTH_STATE_COOKIE = "pc_oauth_state";
export const OAUTH_STATE_MAX_AGE_SEC = 60 * 10;

export type OAuthProvider = "google" | "github";

export type OAuthIdentity = {
  provider: OAuthProvider;
  providerAccountId: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
};

export type OAuthUserRepository = {
  findByProviderAccount(
    provider: OAuthProvider,
    providerAccountId: string,
  ): Promise<{ userId: string } | null>;
  findUserByEmail(email: string): Promise<{ id: string } | null>;
  linkAccount(
    userId: string,
    provider: OAuthProvider,
    providerAccountId: string,
  ): Promise<void>;
  createUser(input: {
    email: string;
    name: string | null;
    provider: OAuthProvider;
    providerAccountId: string;
  }): Promise<{ userId: string }>;
};

export class OAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "OAuthError";
  }
}

const PROVIDERS = new Set<OAuthProvider>(["google", "github"]);

const DEVELOPMENT_AUTH_SECRET = "dev-only-oauth-secret-do-not-use-in-production";
const INSECURE_AUTH_SECRETS = new Set([
  DEVELOPMENT_AUTH_SECRET,
  "change-me",
  "change-me-to-a-random-secret",
]);

type ProviderConfig = {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId: string | undefined;
  clientSecret: string | undefined;
};

export function isOAuthProvider(value: string): value is OAuthProvider {
  return PROVIDERS.has(value as OAuthProvider);
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim() || DEVELOPMENT_AUTH_SECRET;
  if (
    process.env.NODE_ENV === "production" &&
    (secret.length < 32 || INSECURE_AUTH_SECRETS.has(secret))
  ) {
    throw new Error("AUTH_SECRET must be a unique secret of at least 32 characters in production");
  }
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getAuthSecret()).update(value).digest("base64url");
}

export function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function callbackUrl(provider: OAuthProvider): string {
  return `${appOrigin()}/api/auth/callback/${provider}`;
}

export function createOAuthState(provider: OAuthProvider): string {
  const nonce = randomBytes(16).toString("base64url");
  const exp = String(Date.now() + OAUTH_STATE_MAX_AGE_SEC * 1000);
  const payload = `${provider}.${nonce}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyOAuthState(
  provider: OAuthProvider,
  state: string | null | undefined,
  cookieValue: string | null | undefined,
): boolean {
  if (!state || !cookieValue || state !== cookieValue) return false;
  const parts = state.split(".");
  if (parts.length !== 4) return false;
  const [stateProvider, nonce, exp, signature] = parts;
  if (!stateProvider || !nonce || !exp || !signature) return false;
  if (stateProvider !== provider) return false;
  const expMs = Number(exp);
  if (!Number.isFinite(expMs) || expMs < Date.now()) return false;
  const payload = `${stateProvider}.${nonce}.${exp}`;
  const expected = sign(payload);
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function providerConfig(provider: OAuthProvider): ProviderConfig {
  if (provider === "google") {
    return {
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: ["openid", "email", "profile"],
      clientId: process.env.GOOGLE_CLIENT_ID?.trim(),
      clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim(),
    };
  }
  return {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["read:user", "user:email"],
    clientId: process.env.GITHUB_CLIENT_ID?.trim(),
    clientSecret: process.env.GITHUB_CLIENT_SECRET?.trim(),
  };
}

export function isProviderConfigured(provider: OAuthProvider): boolean {
  const config = providerConfig(provider);
  return Boolean(config.clientId && config.clientSecret);
}

export function configuredOAuthProviders(): OAuthProvider[] {
  return (["google", "github"] as const).filter(isProviderConfigured);
}

export function requireProviderCredentials(provider: OAuthProvider): {
  clientId: string;
  clientSecret: string;
  config: ProviderConfig;
} {
  const config = providerConfig(provider);
  if (!config.clientId || !config.clientSecret) {
    throw new OAuthError(
      "not_configured",
      `${provider} sign-in is not configured. Set client ID and secret.`,
    );
  }
  return { clientId: config.clientId, clientSecret: config.clientSecret, config };
}

export function getAuthorizeUrl(provider: OAuthProvider, state: string): string {
  const { clientId, config } = requireProviderCredentials(provider);
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl(provider));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);
  if (provider === "google") {
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");
  }
  return url.toString();
}

async function exchangeCodeForToken(
  provider: OAuthProvider,
  code: string,
): Promise<string> {
  const { clientId, clientSecret, config } = requireProviderCredentials(provider);
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: callbackUrl(provider),
    grant_type: "authorization_code",
  });

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  } | null;

  if (!res.ok || !json?.access_token) {
    throw new OAuthError(
      "provider_error",
      json?.error_description || json?.error || "Could not complete sign-in with the provider.",
    );
  }
  return json.access_token;
}

async function fetchGoogleProfile(accessToken: string): Promise<OAuthIdentity> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => null)) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  } | null;
  if (!res.ok || !json?.sub) {
    throw new OAuthError("provider_error", "Could not load your Google profile.");
  }
  return {
    provider: "google",
    providerAccountId: json.sub,
    email: json.email?.trim().toLowerCase() ?? "",
    emailVerified: Boolean(json.email_verified),
    name: json.name?.trim() || null,
  };
}

async function fetchGitHubProfile(accessToken: string): Promise<OAuthIdentity> {
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "PixelCrew",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const user = (await userRes.json().catch(() => null)) as {
    id?: number;
    email?: string | null;
    name?: string | null;
    login?: string;
  } | null;
  if (!userRes.ok || user?.id == null) {
    throw new OAuthError("provider_error", "Could not load your GitHub profile.");
  }

  let email = user.email?.trim().toLowerCase() ?? "";
  let emailVerified = false;

  const emailsRes = await fetch("https://api.github.com/user/emails", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "PixelCrew",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (emailsRes.ok) {
    const emails = (await emailsRes.json().catch(() => null)) as Array<{
      email?: string;
      primary?: boolean;
      verified?: boolean;
    }> | null;
    const verified =
      emails?.find((e) => e.primary && e.verified && e.email) ??
      emails?.find((e) => e.verified && e.email);
    if (verified?.email) {
      email = verified.email.trim().toLowerCase();
      emailVerified = true;
    }
  }

  return {
    provider: "github",
    providerAccountId: String(user.id),
    email,
    emailVerified,
    name: user.name?.trim() || user.login?.trim() || null,
  };
}

export async function fetchOAuthIdentity(
  provider: OAuthProvider,
  code: string,
): Promise<OAuthIdentity> {
  const accessToken = await exchangeCodeForToken(provider, code);
  if (provider === "google") return fetchGoogleProfile(accessToken);
  return fetchGitHubProfile(accessToken);
}

export async function resolveOAuthUser(
  identity: OAuthIdentity,
  repo: OAuthUserRepository,
): Promise<{ userId: string }> {
  const email = identity.email.trim().toLowerCase();
  if (!email) {
    throw new OAuthError(
      "missing_email",
      "Your provider account did not return an email address.",
    );
  }
  if (!identity.emailVerified) {
    throw new OAuthError(
      "email_unverified",
      "A verified email from the provider is required to sign in.",
    );
  }

  const linked = await repo.findByProviderAccount(
    identity.provider,
    identity.providerAccountId,
  );
  if (linked) return linked;

  const existing = await repo.findUserByEmail(email);
  if (existing) {
    await repo.linkAccount(existing.id, identity.provider, identity.providerAccountId);
    return { userId: existing.id };
  }

  return repo.createUser({
    email,
    name: identity.name,
    provider: identity.provider,
    providerAccountId: identity.providerAccountId,
  });
}

async function uniqueOrgSlug(base: string): Promise<string> {
  const normalized = slugify(base) || "company";
  let slug = normalized;
  let n = 0;
  while (await prisma.organization.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${normalized}-${n}`;
  }
  return slug;
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

export const prismaOAuthUserRepository: OAuthUserRepository = {
  async findByProviderAccount(provider, providerAccountId) {
    const account = await prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: { provider, providerAccountId },
      },
      select: { userId: true },
    });
    return account;
  },

  async findUserByEmail(email) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    return user;
  },

  async linkAccount(userId, provider, providerAccountId) {
    try {
      await prisma.oAuthAccount.create({
        data: { userId, provider, providerAccountId },
      });
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
      const existing = await prisma.oAuthAccount.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        select: { userId: true },
      });
      if (!existing || existing.userId !== userId) {
        throw new OAuthError(
          "provider_error",
          "This provider account is already linked to another user.",
        );
      }
    }
  },

  async createUser({ email, name, provider, providerAccountId }) {
    let userId: string;
    try {
      const user = await prisma.user.create({
        data: {
          email,
          name,
          oauthAccounts: {
            create: { provider, providerAccountId },
          },
        },
      });
      userId = user.id;
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
      // Concurrent signup with the same email — link instead of creating twice.
      const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (!existing) throw err;
      await prismaOAuthUserRepository.linkAccount(
        existing.id,
        provider,
        providerAccountId,
      );
      return { userId: existing.id };
    }

    try {
      const slug = await uniqueOrgSlug(name ?? email.split("@")[0] ?? "company");
      await createWorkspaceForUser(
        userId,
        name ? `${name}'s Company` : "My Company",
        slug,
      );
    } catch (err) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
      throw err;
    }
    return { userId };
  },
};

export function oauthErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "access_denied":
      return "Sign-in was cancelled.";
    case "invalid_state":
      return "Sign-in expired or was invalid. Please try again.";
    case "missing_email":
      return "Your provider account did not return an email address.";
    case "email_unverified":
      return "A verified email from the provider is required to sign in.";
    case "not_configured":
      return "Social sign-in is not configured on this server yet.";
    case "provider_error":
      return "Could not complete sign-in with the provider. Please try again.";
    case "invalid_provider":
      return "Unknown sign-in provider.";
    case "rate_limited":
      return "Too many sign-in attempts. Please wait a moment and try again.";
    default:
      return "Could not complete sign-in. Please try again.";
  }
}
