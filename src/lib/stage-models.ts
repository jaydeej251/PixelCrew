import type { ProviderType } from "@prisma/client";

export type PlanningStageKind = "dispatch" | "council" | "synth" | "legacy";

/**
 * Cheaper defaults for Staff the goal (dispatch) only.
 * Council brainstorms, synth, engineer, and QA keep the run’s selected model —
 * quality over max efficiency (Launch A trust = plan + ship fidelity).
 * Same provider + key; not per-teammate BYOK.
 */
const CHEAP_PLANNING_MODELS: Partial<Record<ProviderType, string>> = {
  openrouter: "openai/gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  google: "gemini-2.0-flash",
  openai_compatible: "gpt-4o-mini",
  // ollama / mock: leave the run model — local cost is not BYOK-metered the same way
};

export function cheapPlanningModel(provider: ProviderType): string | undefined {
  return CHEAP_PLANNING_MODELS[provider];
}

/**
 * Returns a model override for dispatch only, or null when the run model should stay.
 * Council stays on the run model so brainstorm quality feeds a better merged plan.
 */
export function planningStageModelOverride(
  provider: ProviderType,
  runModel: string,
  kind: PlanningStageKind | null,
): string | null {
  if (kind !== "dispatch") return null;
  const cheap = cheapPlanningModel(provider);
  if (!cheap) return null;
  const current = runModel.trim();
  if (!current || current === cheap) return null;
  return cheap;
}
