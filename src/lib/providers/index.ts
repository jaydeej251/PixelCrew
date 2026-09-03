import type { ProviderType } from "@prisma/client";
import { resolveApiKey } from "../run-setup";
import {
  isOllamaCloudBaseUrl,
  isOllamaLocalBaseUrl,
  normalizeOllamaBaseUrl,
  OLLAMA_CLOUD_BASE_URL,
  OLLAMA_LOCAL_BASE_URL,
} from "../ollama-endpoints";
import { MockProvider } from "./mock";
import { createOpenAICompatible } from "./openai-compatible";
import type { LLMProvider, ProviderConfig } from "./types";
export { estimateCost } from "./types";

function resolveOllamaBaseUrl(
  credentialBaseUrl: string | null | undefined,
  hasApiKey: boolean,
): string {
  const fromCredential = credentialBaseUrl?.trim();
  if (fromCredential) return normalizeOllamaBaseUrl(fromCredential);

  const fromEnv = process.env.OLLAMA_BASE_URL?.trim();
  if (fromEnv) {
    const cleaned = normalizeOllamaBaseUrl(fromEnv);
    // .env.example defaults to local; a cloud API key should win over that default.
    if (hasApiKey && isOllamaLocalBaseUrl(cleaned)) {
      return OLLAMA_CLOUD_BASE_URL;
    }
    return cleaned;
  }

  return hasApiKey ? OLLAMA_CLOUD_BASE_URL : OLLAMA_LOCAL_BASE_URL;
}

export function resolveProviderConfig(
  provider: ProviderType,
  model: string,
  credential?: { encryptedKey?: string | null; baseUrl?: string | null },
): ProviderConfig {
  const { key: apiKey } = resolveApiKey(provider, credential);

  switch (provider) {
    case "openrouter":
      return {
        provider,
        apiKey,
        baseUrl: "https://openrouter.ai/api/v1",
        model,
      };
    case "google":
      return {
        provider,
        apiKey,
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        model,
      };
    case "ollama": {
      const hasApiKey = Boolean(apiKey);
      const baseUrl = resolveOllamaBaseUrl(credential?.baseUrl, hasApiKey);
      return {
        provider,
        // Local Ollama ignores the bearer token; cloud requires a real key.
        apiKey: apiKey ?? "ollama",
        baseUrl,
        model,
      };
    }
    case "openai_compatible":
    case "anthropic":
      return {
        provider,
        apiKey,
        baseUrl: credential?.baseUrl?.trim() || undefined,
        model,
      };
    default:
      return { provider: "mock", model: "mock" };
  }
}

export function createProvider(
  config: ProviderConfig,
  position: string,
  taskTitle: string,
  ceoGoal = "",
): LLMProvider {
  if (config.provider === "mock") {
    return new MockProvider(position, taskTitle, ceoGoal);
  }

  const key = config.apiKey?.trim();
  const ollamaNeedsKey =
    config.provider === "ollama" && isOllamaCloudBaseUrl(config.baseUrl);
  const missingKey = !key || key.length < 8 || key === "ollama";
  if ((config.provider !== "ollama" || ollamaNeedsKey) && missingKey) {
    throw new Error(
      config.provider === "ollama"
        ? "Ollama Cloud requires an API key from ollama.com/settings/keys. Save it under Ollama in the sidebar, or set OLLAMA_API_KEY in .env.local."
        : `No valid API key for ${config.provider}. Add OPENROUTER_API_KEY or OPEN_ROUTER_KEY to .env.local and restart the dev server, or save a key in the sidebar.`,
    );
  }

  return createOpenAICompatible({ ...config, apiKey: key });
}
