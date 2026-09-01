import type { ProviderType } from "@prisma/client";
import { decrypt } from "./crypto";

const ENV_ALIASES: Record<ProviderType, string[]> = {
  mock: [],
  openrouter: ["OPENROUTER_API_KEY", "OPEN_ROUTER_KEY", "OPEN_ROUTER_API_KEY"],
  google: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
  ollama: ["OLLAMA_BASE_URL"],
  openai_compatible: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
};

export function getEnvProviderKey(provider: ProviderType): string | undefined {
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
  return key.length >= 8;
}

/** Resolve API key: valid stored credential first, then env. Skips bad stored keys. */
export function resolveApiKey(
  provider: ProviderType,
  credential?: { encryptedKey?: string | null } | null,
): { key?: string; source: "credential" | "env" | "none" } {
  if (provider === "mock" || provider === "ollama") {
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
  { id: "google" as const, label: "Google Gemini" },
  { id: "ollama" as const, label: "Ollama (local)" },
];

export async function workspaceHasProvider(
  workspaceId: string,
  provider: ProviderType,
): Promise<{ ready: boolean; source: "credential" | "env" | "none" }> {
  const { prisma } = await import("./db");

  if (provider === "mock") return { ready: true, source: "none" };
  if (provider === "ollama") {
    const cred = await prisma.providerCredential.findFirst({
      where: { workspaceId, provider: "ollama" },
    });
    if (cred?.baseUrl || getEnvProviderKey("ollama") || process.env.OLLAMA_BASE_URL) {
      return { ready: true, source: cred ? "credential" : "env" };
    }
    return { ready: true, source: "env" };
  }

  const cred = await prisma.providerCredential.findFirst({
    where: { workspaceId, provider },
  });
  const resolved = resolveApiKey(provider, cred);
  if (resolved.key) return { ready: true, source: resolved.source };
  return { ready: false, source: "none" };
}

export async function configureAgentsForRun(
  workspaceId: string,
  provider: ProviderType,
  model?: string,
) {
  const { prisma } = await import("./db");
  const resolvedModel = model?.trim() || getDefaultModel(provider);

  await prisma.agent.updateMany({
    where: { workspaceId },
    data: { provider, model: resolvedModel },
  });

  return { provider, model: resolvedModel };
}
