import type { ProviderType } from "@prisma/client";
import { decrypt } from "./crypto";
import { isOllamaCloudBaseUrl } from "./ollama-endpoints";
import { findProviderCredential } from "./provider-credentials";

export {
  isOllamaCloudBaseUrl,
  isOllamaLocalBaseUrl,
  normalizeOllamaBaseUrl,
  OLLAMA_CLOUD_BASE_URL,
  OLLAMA_LOCAL_BASE_URL,
} from "./ollama-endpoints";
export { findProviderCredential, setDefaultProviderCredential } from "./provider-credentials";

const ENV_ALIASES: Record<ProviderType, string[]> = {
  mock: [],
  openrouter: ["OPENROUTER_API_KEY", "OPEN_ROUTER_KEY", "OPEN_ROUTER_API_KEY"],
  google: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
  ollama: ["OLLAMA_API_KEY"],
  openai_compatible: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
};

function sharedEnvironmentKeysAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function getEnvProviderKey(provider: ProviderType): string | undefined {
  if (!sharedEnvironmentKeysAllowed()) return undefined;
  const names = ENV_ALIASES[provider] ?? [];
  for (const name of names) {
    let value = process.env[name]?.trim();
    if (!value) continue;
    // Strip accidental surrounding quotes from .env files
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1).trim();
    }
    if (value) return value;
  }
  return undefined;
}

function isValidOpenRouterKey(key: string): boolean {
  return /^sk-or-v1-[a-zA-Z0-9_-]+$/.test(key);
}

function isValidProviderKey(provider: ProviderType, key: string): boolean {
  if (provider === "openrouter") return isValidOpenRouterKey(key);
  if (provider === "google") return key.length >= 20;
  if (provider === "anthropic") return key.startsWith("sk-ant-");
  if (provider === "ollama") return key.length >= 8 && key !== "ollama";
  return key.length >= 8;
}

/** User-facing reason a raw key should be rejected before save. Null when OK. */
export function providerKeyFormatError(
  provider: ProviderType,
  key: string,
): string | null {
  const trimmed = key.trim();
  if (!trimmed) return "API key is required";
  if (isValidProviderKey(provider, trimmed)) return null;
  if (provider === "openrouter") {
    return "OpenRouter keys must look like sk-or-v1-…. Paste the full key from openrouter.ai/keys.";
  }
  if (provider === "anthropic") {
    return "Anthropic keys must start with sk-ant-.";
  }
  if (provider === "google") {
    return "That Gemini/Google key looks too short. Paste the full key from Google AI Studio.";
  }
  if (provider === "ollama") {
    return "That Ollama key looks invalid. Paste the full secret from ollama.com/settings/keys.";
  }
  return "That API key does not look valid. Paste the full secret and try again.";
}

/** Resolve API key: valid stored credential first, then env. Skips bad stored keys. */
export function resolveApiKey(
  provider: ProviderType,
  credential?: { encryptedKey?: string | null } | null,
): { key?: string; source: "credential" | "env" | "none" } {
  if (provider === "mock") {
    return { source: "none" };
  }

  if (credential?.encryptedKey) {
    try {
      const decrypted = decrypt(credential.encryptedKey).trim();
      if (decrypted.length > 0 && isValidProviderKey(provider, decrypted)) {
        return { key: decrypted, source: "credential" };
      }
      if (decrypted.length > 0) {
        console.warn(
          `[PixelCrew] Stored ${provider} key looks invalid — using .env.local instead`,
        );
      }
    } catch (err) {
      console.warn(
        `[PixelCrew] Could not decrypt stored ${provider} key — trying env fallback:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const fromEnv = getEnvProviderKey(provider);
  if (fromEnv && isValidProviderKey(provider, fromEnv)) {
    return { key: fromEnv, source: "env" };
  }

  return { source: "none" };
}

export function getDefaultModel(provider: ProviderType): string {
  const models: Record<ProviderType, string> = {
    mock: "mock",
    openrouter: "openai/gpt-4o-mini",
    google: "gemini-2.0-flash",
    ollama: "llama3.2",
    openai_compatible: "gpt-4o-mini",
    anthropic: "claude-3-5-haiku-latest",
  };
  return models[provider] ?? "mock";
}

export const RUN_PROVIDERS = [
  { id: "mock" as const, label: "Mock (no API key)" },
  { id: "openrouter" as const, label: "OpenRouter" },
  { id: "anthropic" as const, label: "Anthropic (Claude)" },
  { id: "google" as const, label: "Google Gemini" },
  { id: "ollama" as const, label: "Ollama (local or cloud)" },
];

export async function workspaceHasProvider(
  workspaceId: string,
  provider: ProviderType,
): Promise<{ ready: boolean; source: "credential" | "env" | "none" }> {
  const { prisma } = await import("./db");

  if (provider === "mock") return { ready: true, source: "none" };
  if (provider === "ollama") {
    const cred = await findProviderCredential(prisma, workspaceId, "ollama");
    const resolved = resolveApiKey("ollama", cred);
    if (resolved.key) return { ready: true, source: resolved.source };
    // Local Ollama needs no key; cloud URLs require one.
    if (isOllamaCloudBaseUrl(cred?.baseUrl)) {
      return { ready: false, source: "none" };
    }
    return { ready: true, source: cred?.baseUrl ? "credential" : "env" };
  }

  const cred = await findProviderCredential(prisma, workspaceId, provider);
  const resolved = resolveApiKey(provider, cred);
  if (resolved.key) return { ready: true, source: resolved.source };
  return { ready: false, source: "none" };
}

/** Mock seats have no custom brain yet — they inherit the workspace run default. */
export function shouldInheritRunBrain(provider: ProviderType): boolean {
  return provider === "mock";
}

export function uniqueRosterProviders(
  agents: Array<{ provider: ProviderType }>,
): ProviderType[] {
  return [...new Set(agents.map((a) => a.provider))];
}

/**
 * Apply the run-level default only to unset (mock) seats.
 * Does not overwrite teammates who already have a provider/model.
 * Call only after credentials for the default (if needed) and the roster are validated.
 */
export async function configureAgentsForRun(
  workspaceId: string,
  provider: ProviderType,
  model?: string,
) {
  const { prisma } = await import("./db");
  const resolvedModel = model?.trim() || getDefaultModel(provider);

  await prisma.agent.updateMany({
    where: { workspaceId, provider: "mock" },
    data: { provider, model: resolvedModel },
  });

  return { provider, model: resolvedModel };
}

/**
 * Ensure every non-mock provider already on the roster has a ready credential.
 * Call before configureAgentsForRun so failed Starts never leave half-updated seats.
 */
export async function assertRosterProvidersReady(
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { prisma } = await import("./db");
  const agents = await prisma.agent.findMany({
    where: { workspaceId },
    select: { name: true, provider: true },
  });

  const missing: string[] = [];
  for (const provider of uniqueRosterProviders(agents)) {
    if (shouldInheritRunBrain(provider)) continue;
    const check = await workspaceHasProvider(workspaceId, provider);
    if (check.ready) continue;
    const names = agents
      .filter((a) => a.provider === provider)
      .map((a) => a.name);
    const who = names.length > 0 ? ` (used by ${names.join(", ")})` : "";
    missing.push(`${provider}${who}`);
  }

  if (missing.length === 0) return { ok: true };
  return {
    ok: false,
    error: `Missing API keys for: ${missing.join("; ")}. Add them in Settings → Your API keys, then try again.`,
  };
}

/**
 * Validate default + roster keys, then fill mock seats only.
 * Never mutates agents when validation fails.
 */
export async function prepareWorkspaceBrainsForRun(
  workspaceId: string,
  provider: ProviderType,
  model?: string,
): Promise<
  | { ok: true; provider: ProviderType; model: string }
  | { ok: false; error: string }
> {
  const { prisma } = await import("./db");
  const mockCount = await prisma.agent.count({
    where: { workspaceId, provider: "mock" },
  });

  if (mockCount > 0 && provider !== "mock") {
    const check = await workspaceHasProvider(workspaceId, provider);
    if (!check.ready) {
      return {
        ok: false,
        error: `No key for ${provider}. Add it in Settings → Your API keys, then try again.`,
      };
    }
  }

  const roster = await assertRosterProvidersReady(workspaceId);
  if (!roster.ok) return roster;

  const llm = await configureAgentsForRun(workspaceId, provider, model);
  return { ok: true, ...llm };
}
