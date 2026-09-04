"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [statuses, setStatuses] = useState<ProviderReadyStatus[] | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  /** null = use sessionStorage; boolean = result of an in-session Test click. */
  const [liveTestResult, setLiveTestResult] = useState<boolean | null>(null);

  const providerRef = useRef(provider);
  const onProviderChangeRef = useRef(onProviderChange);
  const onModelChangeRef = useRef(onModelChange);
  const onReadinessChangeRef = useRef(onReadinessChange);

  // Keep latest callbacks/provider for async fetches without render-time ref writes.
  useEffect(() => {
    providerRef.current = provider;
    onProviderChangeRef.current = onProviderChange;
    onModelChangeRef.current = onModelChange;
    onReadinessChangeRef.current = onReadinessChange;
  }, [provider, onProviderChange, onModelChange, onReadinessChange]);

  // Load provider status. setState only in the fetch callback (not sync in the effect body).
  useEffect(() => {
    let cancelled = false;

    fetch(`/api/providers/status?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then((res) => res.json())
      .then((data: { providers?: ProviderReadyStatus[] }) => {
        if (cancelled) return;
        const next = data.providers ?? [];
        setStatuses(next);
        // Auto-pick a ready real provider only while still on Mock (first load / new keys).
        // providerRef is updated in a separate effect — do not depend on `provider` here
        // or choosing Mock in Settings immediately reverts.
        if (providerRef.current !== "mock") return;
        const pick = preferReadyProvider(next, "mock");
        if (!pick) return;
        onProviderChangeRef.current(pick.provider);
        onModelChangeRef.current(pick.model);
      })
      .catch(() => {
        if (cancelled) return;
        setStatuses([]);
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId, credentialsRevision]);

  const status = (statuses ?? []).find((s) => s.provider === provider);
  const ollamaMode =
    provider === "ollama" ? getOllamaEndpointMode(status?.activeBaseUrl) : null;
  const needsTest = providerRequiresLiveKeyTest(provider, ollamaMode);
  const credentialId = status?.activeCredentialId ?? null;

  // Reset live test UI when the test scope changes (adjust state during render — React-supported).
  const testIdentity = `${workspaceId}|${provider}|${credentialId ?? ""}|${needsTest}|${credentialsRevision}`;
  const [activeTestIdentity, setActiveTestIdentity] = useState(testIdentity);
  if (activeTestIdentity !== testIdentity) {
    setActiveTestIdentity(testIdentity);
    setLiveTestResult(null);
    setTestMessage(null);
  }

  const sessionTestOk = needsTest
    ? readProviderTestOk(workspaceId, provider, credentialId)
    : true;
  const testOk = needsTest ? (liveTestResult ?? sessionTestOk) : true;

  const readiness = useMemo(
    () =>
      buildRunReadinessSteps({
        provider,
        model,
        status,
        testOk,
      }),
    [provider, model, status, testOk],
  );

  const lastReadyKeyRef = useRef<string>("");
  useEffect(() => {
    const key = `${readiness.canStart}:${readiness.blockingReason ?? ""}`;
    if (lastReadyKeyRef.current === key) return;
    lastReadyKeyRef.current = key;
    // Defer parent update so this effect does not sync-set parent state.
    queueMicrotask(() => {
      onReadinessChangeRef.current?.(readiness.canStart, readiness.blockingReason);
    });
  }, [readiness.canStart, readiness.blockingReason]);

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
      setLiveTestResult(ok);
      setTestMessage(
        ok
          ? `✓ ${json.message ?? "Key works"}`
          : `✗ ${json.message ?? json.error ?? "Test failed"}`,
      );
    } catch {
      writeProviderTestOk(workspaceId, provider, credentialId, false);
      setLiveTestResult(false);
      setTestMessage("✗ Could not reach the test endpoint");
    } finally {
      setTesting(false);
    }
  };

  const loading = statuses === null;

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

      {loading ? (
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
