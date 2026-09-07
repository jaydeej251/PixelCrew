import type { ProviderType } from "@prisma/client";
import type { OllamaEndpointMode } from "./ollama-models";

/**
 * Local Ollama is one shared modem for the whole office.
 * Cloud providers — including Ollama Cloud — allow per-teammate brains.
 * Client-safe (no crypto / db) so Settings UI can import it.
 */
export function shouldShareBrainAcrossRoster(
  provider: ProviderType | string,
  ollamaMode: OllamaEndpointMode | null,
): boolean {
  return provider === "ollama" && ollamaMode === "local";
}

/** True when cloud BYOK (or mock) — per-seat provider/model is allowed. */
export function allowsPerAgentBrains(
  provider: ProviderType | string,
  ollamaMode: OllamaEndpointMode | null,
): boolean {
  return !shouldShareBrainAcrossRoster(provider, ollamaMode);
}

/**
 * When the CEO Starts with Ollama, apply that brain to every seat if:
 * - endpoint is local (shared modem), or
 * - any seat still has a leftover non-Ollama provider (e.g. OpenRouter from an older run).
 *
 * Pure Ollama-cloud rosters keep per-seat models (only mock seats inherit the default).
 */
export function shouldForceOllamaTeamBrain(opts: {
  startProvider: ProviderType | string;
  ollamaMode: OllamaEndpointMode | null;
  rosterProviders: Array<ProviderType | string>;
}): boolean {
  if (opts.startProvider !== "ollama") return false;
  if (shouldShareBrainAcrossRoster("ollama", opts.ollamaMode)) return true;
  return opts.rosterProviders.some(
    (p) => p !== "mock" && p !== "ollama",
  );
}
