/**
 * Persist the CEO's "Which AI to use" pick across refresh.
 * Agent rows can lag (e.g. still OpenRouter from an older run) — never let that
 * silently overwrite an explicit Ollama (or other) selection on reload.
 */

export type RunLlmPreference = {
  provider: string;
  model: string;
};

export function runLlmPreferenceKey(workspaceId: string): string {
  return `pixelcrew:run-llm:${workspaceId}`;
}

export function readRunLlmPreference(workspaceId: string): RunLlmPreference | null {
  if (typeof window === "undefined" || !workspaceId) return null;
  try {
    const raw = window.localStorage.getItem(runLlmPreferenceKey(workspaceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RunLlmPreference>;
    const provider = typeof parsed.provider === "string" ? parsed.provider.trim() : "";
    const model = typeof parsed.model === "string" ? parsed.model.trim() : "";
    if (!provider) return null;
    return { provider, model: model || provider };
  } catch {
    return null;
  }
}

export function writeRunLlmPreference(
  workspaceId: string,
  provider: string,
  model: string,
): void {
  if (typeof window === "undefined" || !workspaceId) return;
  const next: RunLlmPreference = {
    provider: provider.trim() || "mock",
    model: model.trim() || "mock",
  };
  try {
    window.localStorage.setItem(runLlmPreferenceKey(workspaceId), JSON.stringify(next));
  } catch {
    // Ignore private-mode / quota failures.
  }
}

/** Prefer the CEO's saved picker; fall back to the first agent's brain. */
export function resolveInitialRunLlm(opts: {
  workspaceId: string;
  agentProvider?: string | null;
  agentModel?: string | null;
}): RunLlmPreference {
  const saved = readRunLlmPreference(opts.workspaceId);
  if (saved) return saved;
  return {
    provider: opts.agentProvider?.trim() || "mock",
    model: opts.agentModel?.trim() || "mock",
  };
}
