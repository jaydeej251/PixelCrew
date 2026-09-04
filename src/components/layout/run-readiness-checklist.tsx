"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getOllamaEndpointMode } from "@/lib/ollama-models";
import {
  buildRunReadinessSteps,
  preferReadyProvider,
  providerRequiresLiveKeyTest,
  readProviderTestOk,
  writeProviderTestOk,
  type ProviderReadyStatus,
} from "@/lib/run-readiness";
import { Check, Circle, Settings2 } from "lucide-react";

type RunReadinessChecklistProps = {
  workspaceId: string;
  provider: string;
  model: string;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  onOpenSettings: () => void;
  /** Bump when credentials change so status reloads. */
  credentialsRevision?: number;
  onReadinessChange?: (canStart: boolean, reason: string | null) => void;
};

export function RunReadinessChecklist({
  workspaceId,
  provider,
  model,
  onProviderChange,
  onModelChange,
  onOpenSettings,
  credentialsRevision = 0,
  onReadinessChange,
}: RunReadinessChecklistProps) {
  const [statuses, setStatuses] = useState<ProviderReadyStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/providers/status?workspaceId=${workspaceId}`);
      const data = await res.json();
      const next = (data.providers ?? []) as ProviderReadyStatus[];
      setStatuses(next);
      return next;
    } catch {
      setStatuses([]);
      return [] as ProviderReadyStatus[];
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void reload().then((next) => {
      const pick = preferReadyProvider(next, provider);
      if (!pick) return;
      onProviderChange(pick.provider);
      onModelChange(pick.model);
    });
    // credentialsRevision reloads status; provider is read so we only auto-pick while still on mock
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid looping on onProviderChange identity
  }, [reload, credentialsRevision, provider]);

  const status = statuses.find((s) => s.provider === provider);
  const ollamaMode =
    provider === "ollama" ? getOllamaEndpointMode(status?.activeBaseUrl) : null;
  const needsTest = providerRequiresLiveKeyTest(provider, ollamaMode);
  const credentialId = status?.activeCredentialId ?? null;

  useEffect(() => {
    if (!needsTest) {
      setTestOk(true);
      setTestMessage(null);
      return;
    }
    setTestOk(readProviderTestOk(workspaceId, provider, credentialId));
    setTestMessage(null);
  }, [workspaceId, provider, credentialId, needsTest, credentialsRevision]);

  const readiness = useMemo(
    () =>
      buildRunReadinessSteps({
        provider,
        model,
        status,
        testOk: needsTest ? testOk : true,
      }),
    [provider, model, status, testOk, needsTest],
  );

  const lastReadyRef = useRef<{ canStart: boolean; reason: string | null } | null>(null);
  useEffect(() => {
    const prev = lastReadyRef.current;
    if (
      prev &&
      prev.canStart === readiness.canStart &&
      prev.reason === readiness.blockingReason
    ) {
      return;
    }
    lastReadyRef.current = {
      canStart: readiness.canStart,
      reason: readiness.blockingReason,
    };
    onReadinessChange?.(readiness.canStart, readiness.blockingReason);
  }, [readiness.canStart, readiness.blockingReason, onReadinessChange]);

  const runTest = async () => {
    if (provider !== "openrouter" && provider !== "ollama") return;
    setTesting(true);
    setTestMessage(null);
    try {
      const res = await fetch("/api/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, provider }),
      });
      const json = await res.json();
      const ok = Boolean(json.ok);
      writeProviderTestOk(workspaceId, provider, credentialId, ok);
      setTestOk(ok);
      setTestMessage(
        ok
          ? `✓ ${json.message ?? "Key works"}`
          : `✗ ${json.message ?? json.error ?? "Test failed"}`,
      );
    } catch {
      writeProviderTestOk(workspaceId, provider, credentialId, false);
      setTestOk(false);
      setTestMessage("✗ Could not reach the test endpoint");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mb-3 rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-3 text-left shadow-lg ring-1 ring-white/5 backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Before you start
        </p>
        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300"
        >
          <Settings2 size={12} />
          Settings
        </button>
      </div>

      {loading && statuses.length === 0 ? (
        <p className="text-xs text-zinc-500">Checking providers…</p>
      ) : (
        <ul className="space-y-1.5">
          {readiness.steps.map((step) => (
            <li key={step.id} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 shrink-0 text-zinc-500">
                {step.done ? (
                  <Check size={12} className="text-emerald-400" />
                ) : (
                  <Circle size={12} className="text-amber-400/80" />
                )}
              </span>
              <span className="min-w-0">
                <span className={step.done ? "text-zinc-300" : "text-zinc-200"}>
                  {step.label}
                </span>
                {step.detail && (
                  <span className="mt-0.5 block text-[11px] leading-snug text-zinc-500">
                    {step.detail}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {needsTest && !testOk && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            className="!h-8 !px-3 !text-xs"
            disabled={testing || !status?.ready}
            onClick={() => void runTest()}
          >
            {testing ? (
              <>
                <Spinner className="size-3" />
                Testing…
              </>
            ) : provider === "ollama" ? (
              "Test Ollama Cloud key"
            ) : (
              "Test OpenRouter key"
            )}
          </Button>
          <button
            type="button"
            className="text-[11px] text-zinc-500 hover:text-zinc-300"
            onClick={onOpenSettings}
          >
            Fix key in Settings
          </button>
        </div>
      )}

      {testMessage && (
        <p
          className={`mt-2 text-[11px] leading-snug ${
            testOk ? "text-emerald-400/90" : "text-amber-400/90"
          }`}
        >
          {testMessage}
        </p>
      )}

      {provider === "mock" && (
        <p className="mt-2 text-[11px] leading-snug text-zinc-500">
          Mock is fine for a floor walkthrough. For the golden demo, add an Ollama Cloud
          key (full <code className="text-zinc-400">id.secret</code>), pick a cloud model,
          Test, then Start.
        </p>
      )}
    </div>
  );
}
