import type { ProviderType } from "@prisma/client";
import { getDefaultModel, RUN_PROVIDERS } from "./run-setup";

/** Artifact written at Start/resume so auto-hire uses the CEO's picker, not OpenRouter. */
export const RUN_BRAIN_TITLE = "Run brain";

export type RunBrain = {
  provider: ProviderType;
  model: string;
};

/** Structured Start gate when the roster is empty and auto-hire would fire. */
export type AutoHireConfirmPayload = {
  needsAutoHireConfirm: true;
  autoHire: {
    provider: ProviderType;
    model: string;
    providerLabel: string;
  };
};

export function providerDisplayLabel(provider: ProviderType | string): string {
  const known = RUN_PROVIDERS.find((p) => p.id === provider);
  if (known) return known.label;
  if (provider === "openai_compatible") return "OpenAI-compatible";
  return String(provider);
}

export function buildAutoHireConfirmPayload(brain: RunBrain): AutoHireConfirmPayload & {
  error: string;
} {
  const providerLabel = providerDisplayLabel(brain.provider);
  return {
    needsAutoHireConfirm: true,
    autoHire: {
      provider: brain.provider,
      model: brain.model,
      providerLabel,
    },
    error: `Your team is empty. Starting will auto-hire a starter crew using ${providerLabel} (${brain.model}). Confirm to continue.`,
  };
}

export function serializeRunBrain(brain: RunBrain): string {
  return JSON.stringify({
    provider: brain.provider,
    model: brain.model,
    at: new Date().toISOString(),
  });
}

export function parseRunBrain(
  content: string | null | undefined,
): RunBrain | null {
  if (!content?.trim()) return null;
  try {
    const parsed = JSON.parse(content) as Partial<RunBrain>;
    if (typeof parsed.provider !== "string" || !parsed.provider.trim()) {
      return null;
    }
    const provider = parsed.provider.trim() as ProviderType;
    const model =
      typeof parsed.model === "string" && parsed.model.trim()
        ? parsed.model.trim()
        : getDefaultModel(provider);
    return { provider, model };
  } catch {
    return null;
  }
}

/**
 * Prefer the Start/resume brain artifact, then an existing seat, never a hardcoded
 * OpenRouter fallback when the roster was emptied.
 */
export function resolveAutoHireBrain(opts: {
  runBrain?: RunBrain | null;
  sample?: { provider: ProviderType; model: string } | null;
}): RunBrain {
  if (opts.runBrain) return opts.runBrain;
  if (opts.sample) {
    return { provider: opts.sample.provider, model: opts.sample.model };
  }
  return { provider: "mock", model: "mock" };
}
