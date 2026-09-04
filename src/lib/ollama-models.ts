import {
  isOllamaCloudBaseUrl,
  isOllamaLocalBaseUrl,
} from "./ollama-endpoints";

export type OllamaEndpointMode = "cloud" | "local" | "custom";

/** Common local pulls — suggestions only, not a hard allowlist. */
export const OLLAMA_LOCAL_MODEL_SUGGESTIONS = [
  "llama3.2",
  "qwen2.5-coder:14b",
  "mistral",
  "codellama",
] as const;

/**
 * Direct Ollama Cloud API names (no `-cloud` suffix).
 * Catalog changes often — treat as starters, not exhaustive.
 */
export const OLLAMA_CLOUD_MODEL_SUGGESTIONS = [
  "gpt-oss:20b",
  "gpt-oss:120b",
  "deepseek-v4-flash",
  "qwen3.5",
  "minimax-m3",
] as const;

export function getOllamaEndpointMode(
  baseUrl: string | null | undefined,
): OllamaEndpointMode | null {
  if (!baseUrl?.trim()) return null;
  if (isOllamaCloudBaseUrl(baseUrl)) return "cloud";
  if (isOllamaLocalBaseUrl(baseUrl)) return "local";
  return "custom";
}

export function getOllamaSuggestedModels(
  mode: OllamaEndpointMode | null,
): readonly string[] {
  if (mode === "cloud") return OLLAMA_CLOUD_MODEL_SUGGESTIONS;
  if (mode === "local") return OLLAMA_LOCAL_MODEL_SUGGESTIONS;
  return [];
}

export function getOllamaDefaultModelForMode(
  mode: OllamaEndpointMode | null,
): string {
  if (mode === "cloud") return OLLAMA_CLOUD_MODEL_SUGGESTIONS[0];
  return OLLAMA_LOCAL_MODEL_SUGGESTIONS[0];
}

/**
 * Direct ollama.com API uses names without `-cloud`.
 * The suffix is for local Ollama that offloads to cloud (`localhost:11434`).
 */
export function ollamaModelHasLocalCloudSuffix(model: string): boolean {
  return /:cloud$|-cloud$/i.test(model.trim());
}

/**
 * Ollama Cloud keys are typically `id.secret`. A bare 32-char hex often means
 * only the public id was copied and chat will 401 while listing still looks fine.
 */
export function looksLikeIncompleteOllamaApiKey(key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed) return false;
  if (trimmed.includes(".")) return false;
  return /^[a-f0-9]{32}$/i.test(trimmed) || trimmed.length < 40;
}

/** Soft UX signal when the typed model sits in the other catalog's starters. */
export function ollamaModelLooksMismatched(
  model: string,
  mode: OllamaEndpointMode | null,
): boolean {
  const trimmed = model.trim().toLowerCase();
  if (!trimmed || !mode || mode === "custom") return false;

  if (mode === "cloud" && ollamaModelHasLocalCloudSuffix(trimmed)) return true;

  const other =
    mode === "cloud"
      ? OLLAMA_LOCAL_MODEL_SUGGESTIONS
      : OLLAMA_CLOUD_MODEL_SUGGESTIONS;

  return other.some((name) => name.toLowerCase() === trimmed);
}
