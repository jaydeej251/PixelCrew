import {
  getOllamaDefaultModelForMode,
  getOllamaEndpointMode,
  type OllamaEndpointMode,
} from "./ollama-models";

export type ProviderReadyStatus = {
  provider: string;
  label: string;
  ready: boolean;
  source: "credential" | "env" | "none";
  defaultModel: string;
  activeCredentialId?: string | null;
  activeCredentialLabel?: string | null;
  activeBaseUrl?: string | null;
  isDefaultCredential?: boolean;
};

/** Providers where a failed key commonly looks "ready" until chat runs. */
export function providerRequiresLiveKeyTest(
  provider: string,
  ollamaMode: OllamaEndpointMode | null,
): boolean {
  if (provider === "openrouter") return true;
  if (provider === "ollama" && ollamaMode === "cloud") return true;
  return false;
}

export function providerTestStorageKey(
  workspaceId: string,
  provider: string,
  credentialId: string | null | undefined,
): string {
  return `pixelcrew:provider-test-ok:${workspaceId}:${provider}:${credentialId ?? "env"}`;
}

export function readProviderTestOk(
  workspaceId: string,
  provider: string,
  credentialId: string | null | undefined,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(
      providerTestStorageKey(workspaceId, provider, credentialId),
    ) === "1";
  } catch {
    return false;
  }
}

export function writeProviderTestOk(
  workspaceId: string,
  provider: string,
  credentialId: string | null | undefined,
  ok: boolean,
): void {
  if (typeof window === "undefined") return;
  try {
    const key = providerTestStorageKey(workspaceId, provider, credentialId);
    if (ok) window.sessionStorage.setItem(key, "1");
    else window.sessionStorage.removeItem(key);
  } catch {
    // Ignore private-mode / quota failures — Start still offers an inline Test.
  }
}

const PROVIDER_PREFERENCE = [
  "ollama",
  "openrouter",
  "google",
  "openai_compatible",
  "anthropic",
] as const;

/**
 * Prefer a ready real provider over mock so cold demos don't silently use Mock.
 */
export function preferReadyProvider(
  statuses: ProviderReadyStatus[],
  currentProvider: string,
): { provider: string; model: string } | null {
  if (currentProvider !== "mock") return null;
  for (const id of PROVIDER_PREFERENCE) {
    const status = statuses.find((s) => s.provider === id && s.ready);
    if (!status) continue;
    if (id === "ollama") {
      const mode = getOllamaEndpointMode(status.activeBaseUrl);
      return { provider: id, model: getOllamaDefaultModelForMode(mode) };
    }
    return {
      provider: id,
      model: status.defaultModel,
    };
  }
  return null;
}

export type ReadinessStepId = "provider" | "key" | "model" | "test";

export type ReadinessStep = {
  id: ReadinessStepId;
  label: string;
  done: boolean;
  detail?: string;
};

export function buildRunReadinessSteps(opts: {
  provider: string;
  model: string;
  status: ProviderReadyStatus | undefined;
  testOk: boolean;
}): { steps: ReadinessStep[]; canStart: boolean; blockingReason: string | null } {
  const { provider, model, status, testOk } = opts;
  const ollamaMode =
    provider === "ollama" ? getOllamaEndpointMode(status?.activeBaseUrl) : null;
  const needsTest = providerRequiresLiveKeyTest(provider, ollamaMode);

  const steps: ReadinessStep[] = [
    {
      id: "provider",
      label: provider === "mock" ? "Using Mock (demo only)" : `Provider: ${status?.label ?? provider}`,
      done: provider === "mock" || Boolean(status?.ready),
      detail:
        provider === "mock"
          ? "Switch to Ollama or OpenRouter in Settings for a real run."
          : status?.ready
            ? status.activeCredentialLabel
              ? `Active: ${status.activeCredentialLabel}`
              : `Key via ${status.source}`
            : "Add a key under Settings → Your API keys.",
    },
    {
      id: "key",
      label:
        ollamaMode === "cloud"
          ? "Ollama Cloud key (full id.secret)"
          : ollamaMode === "local"
            ? "Local Ollama (no key)"
            : "API key saved",
      done:
        provider === "mock" ||
        ollamaMode === "local" ||
        Boolean(status?.ready),
      detail:
        ollamaMode === "cloud"
          ? "Paste the full key once from ollama.com/settings/keys."
          : undefined,
    },
    {
      id: "model",
      label: "Model selected",
      done: provider === "mock" || model.trim().length > 0,
      detail:
        ollamaMode === "cloud"
          ? "Use a cloud chip (e.g. gpt-oss:20b) — no -cloud suffix."
          : undefined,
    },
  ];

  if (needsTest) {
    steps.push({
      id: "test",
      label: provider === "ollama" ? "Test Ollama Cloud key" : "Test OpenRouter key",
      done: testOk,
      detail: testOk
        ? "Chat probe passed this session."
        : "Required before Start — proves /api/chat works, not just model list.",
    });
  }

  const canStart = steps.every((s) => s.done);
  const blocking = steps.find((s) => !s.done);
  return {
    steps,
    canStart,
    blockingReason: canStart
      ? null
      : blocking?.detail ?? blocking?.label ?? "Finish setup before starting.",
  };
}
