import type { ProviderType } from "@prisma/client";
import { resolveApiKey, getEnvProviderKey } from "../run-setup";
import { MockProvider } from "./mock";
import { createOpenAICompatible } from "./openai-compatible";
import type { LLMProvider, ProviderConfig } from "./types";
export { estimateCost } from "./types";

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
    case "ollama":
      return {
        provider,
        apiKey: "ollama",
        baseUrl:
          credential?.baseUrl?.trim() ||
          getEnvProviderKey("ollama") ||
          process.env.OLLAMA_BASE_URL?.trim() ||
          "http://127.0.0.1:11434/v1",
        model,
      };
    case "openai_compatible":
    case "anthropic":
      return {
        provider,
        apiKey,
        baseUrl: credential?.baseUrl ?? undefined,
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
  if (config.provider !== "ollama" && (!key || key.length < 8)) {
    throw new Error(
      `No valid API key for ${config.provider}. Add OPENROUTER_API_KEY or OPEN_ROUTER_KEY to .env.local and restart the dev server, or save a key in the sidebar.`,
    );
  }

  return createOpenAICompatible({ ...config, apiKey: key });
}
