import type { ProviderType } from "@prisma/client";
import { decrypt } from "../crypto";
import { MockProvider } from "./mock";
import { createOpenAICompatible } from "./openai-compatible";
import type { LLMProvider, ProviderConfig } from "./types";
export { estimateCost } from "./types";

function getDecryptedKey(encrypted?: string | null): string | undefined {
  if (!encrypted) return undefined;
  return decrypt(encrypted);
}

export function resolveProviderConfig(
  provider: ProviderType,
  model: string,
  credential?: { encryptedKey?: string | null; baseUrl?: string | null },
): ProviderConfig {
  const decryptKey = getDecryptedKey(credential?.encryptedKey);

  switch (provider) {
    case "openrouter":
      return {
        provider,
        apiKey: decryptKey ?? process.env.OPENROUTER_API_KEY,
        baseUrl: "https://openrouter.ai/api/v1",
        model,
      };
    case "google":
      return {
        provider,
        apiKey: decryptKey ?? process.env.GOOGLE_API_KEY,
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        model,
      };
    case "ollama":
      return {
        provider,
        apiKey: "ollama",
        baseUrl: credential?.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1",
        model,
      };
    case "openai_compatible":
    case "anthropic":
      return {
        provider,
        apiKey: decryptKey ?? process.env.OPENAI_API_KEY,
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
): LLMProvider {
  if (config.provider === "mock") {
    return new MockProvider(position, taskTitle);
  }
  return createOpenAICompatible(config);
}
