import {
  getOllamaDefaultModelForMode,
  getOllamaSuggestedModels,
  type OllamaEndpointMode,
} from "./ollama-models";
import { getDefaultModel } from "./run-setup";
import type { ProviderType } from "@prisma/client";

/**
 * Curated dropdown catalogs — no free-typing model ids.
 * Ollama local prefers the live `/api/providers/ollama/models` list;
 * cloud/custom fall back to starters here.
 */
export const PROVIDER_MODEL_CATALOGS: Record<string, readonly string[]> = {
  mock: ["mock"],
  openrouter: [
    "openai/gpt-4o-mini",
    "openai/gpt-4o",
    "openai/gpt-4.1-mini",
    "anthropic/claude-3.5-sonnet",
    "anthropic/claude-3.5-haiku",
    "google/gemini-2.0-flash-001",
    "meta-llama/llama-3.3-70b-instruct",
    "deepseek/deepseek-chat",
  ],
  anthropic: [
    "claude-3-5-haiku-latest",
    "claude-3-5-sonnet-latest",
    "claude-3-7-sonnet-latest",
    "claude-sonnet-4-20250514",
  ],
  google: [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
  ],
  openai_compatible: ["gpt-4o-mini", "gpt-4o"],
};

export function curatedModelsForProvider(provider: string): readonly string[] {
  if (provider === "ollama") return getOllamaSuggestedModels("local");
  return PROVIDER_MODEL_CATALOGS[provider] ?? [];
}

/**
 * Models shown in a select for this provider.
 * Ollama: prefer fetched local installs when available; else mode starters.
 */
export function resolveModelChoices(opts: {
  provider: string;
  ollamaMode?: OllamaEndpointMode | null;
  fetchedOllamaModels?: readonly string[] | null;
}): string[] {
  const { provider, ollamaMode = null, fetchedOllamaModels } = opts;
  if (provider === "mock") return ["mock"];
  if (provider === "ollama") {
    if (fetchedOllamaModels && fetchedOllamaModels.length > 0) {
      return [...fetchedOllamaModels];
    }
    const starters = getOllamaSuggestedModels(ollamaMode);
    if (starters.length > 0) return [...starters];
    return [...getOllamaSuggestedModels("local")];
  }
  return [...curatedModelsForProvider(provider)];
}

/** Keep a previously saved id visible once if it is not in the catalog. */
export function withCurrentModelOption(
  choices: readonly string[],
  current: string,
): string[] {
  const trimmed = current.trim();
  if (!trimmed) return [...choices];
  if (choices.some((c) => c === trimmed)) return [...choices];
  return [trimmed, ...choices];
}

export function defaultModelForProviderSelect(
  provider: string,
  ollamaMode?: OllamaEndpointMode | null,
): string {
  if (provider === "ollama") {
    return getOllamaDefaultModelForMode(ollamaMode ?? "local");
  }
  const catalog = curatedModelsForProvider(provider);
  if (catalog.length > 0) return catalog[0]!;
  return getDefaultModel(provider as ProviderType);
}

/** Snap an invalid/typed model onto the first listed choice. */
export function coerceModelToChoices(
  model: string,
  choices: readonly string[],
): string {
  const trimmed = model.trim();
  if (choices.length === 0) return trimmed;
  if (choices.includes(trimmed)) return trimmed;
  return choices[0]!;
}
