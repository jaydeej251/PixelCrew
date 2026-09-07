"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Cpu } from "lucide-react";
import {
  getOllamaDefaultModelForMode,
  getOllamaEndpointMode,
  type OllamaEndpointMode,
} from "@/lib/ollama-models";
import { writeProviderTestOk } from "@/lib/run-readiness";
import { readResponseJson } from "@/lib/http-json";
import { ProviderModelSelect } from "@/components/settings/provider-model-select";

type ProviderStatus = {
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

type RunSettingsProps = {
  workspaceId: string;
  provider: string;
  model: string;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  /**
   * User changed Which AI to use — apply this brain to every teammate.
   * Per-seat overrides remain available under Your team afterward.
   */
  onTeamBrainChange?: (provider: string, model: string) => void | Promise<void>;
  /** Bump when credentials change so endpoint/status stay in sync. */
  credentialsRevision?: number;
  /** Fired after a successful / failed live key probe (for Start gating). */
  onProviderTestResult?: (ok: boolean) => void;
  /** Local Ollama: one brain applies to the whole roster. */
  sharedBrainOnly?: boolean;
};

export function RunSettings({
  workspaceId,
  provider,
  model,
  onProviderChange,
  onModelChange,
  onTeamBrainChange,
  credentialsRevision = 0,
  onProviderTestResult,
  sharedBrainOnly = false,
}: RunSettingsProps) {
  const [statuses, setStatuses] = useState<ProviderStatus[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");

  const reload = useCallback(() => {
    fetch(`/api/providers/status?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((d) => setStatuses(d.providers ?? []))
      .catch(() => setStatuses([]));
  }, [workspaceId]);

  useEffect(() => {
    reload();
  }, [reload, credentialsRevision]);

  const current = statuses.find((s) => s.provider === provider);
  const ollamaMode =
    provider === "ollama" ? getOllamaEndpointMode(current?.activeBaseUrl) : null;

  const applyTeamBrain = async (nextProvider: string, nextModel: string) => {
    onProviderChange(nextProvider);
    onModelChange(nextModel);
    if (!onTeamBrainChange) return;
    setSyncing(true);
    setSyncError("");
    try {
      await onTeamBrainChange(nextProvider, nextModel);
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : "Couldn’t update the team brain.",
      );
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle className="flex items-center gap-2">
          <Cpu size={14} />
          Which AI to use
        </PanelTitle>
      </PanelHeader>
      <PanelContent className="space-y-3">
        <p className="text-xs text-zinc-500">
          {sharedBrainOnly ? (
            <>
              Local Ollama uses <span className="text-zinc-300">one brain for the whole team</span>.
              Changing provider or model here applies to everyone on Start. Under Your API keys,
              click <span className="text-zinc-300">Use local</span> so PixelCrew talks to the
              Ollama app on this computer — then Start again. Leftover OpenRouter seats are
              replaced when you Start with Ollama.
            </>
          ) : (
            <>
              This is the <span className="text-zinc-300">main team brain</span>. Changing
              provider or model here updates every teammate. You can still override one seat
              under Your team afterward. For Ollama, choose{" "}
              <span className="text-zinc-400">Use cloud</span> or{" "}
              <span className="text-zinc-400">Use local</span> under Your API keys.
            </>
          )}
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="run-provider" className="text-xs text-zinc-400">
            Provider
          </Label>
          <select
            id="run-provider"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            value={provider}
            disabled={syncing}
            onChange={(e) => {
              const nextId = e.target.value;
              const next = statuses.find((s) => s.provider === nextId);
              let nextModel = model;
              if (next) {
                if (nextId === "ollama") {
                  const mode = getOllamaEndpointMode(next.activeBaseUrl);
                  nextModel = getOllamaDefaultModelForMode(mode);
                } else {
                  nextModel = next.defaultModel;
                }
              }
              void applyTeamBrain(nextId, nextModel);
            }}
          >
            {statuses.map((s) => (
              <option key={s.provider} value={s.provider}>
                {s.label}
                {s.provider !== "mock" && (s.ready ? " ✓" : " (no key)")}
              </option>
            ))}
          </select>
        </div>

        {provider === "ollama" && current?.ready && (
          <OllamaEndpointCard
            mode={ollamaMode}
            baseUrl={current.activeBaseUrl}
            label={current.activeCredentialLabel}
          />
        )}

        {provider !== "mock" && (
          <div className="space-y-1.5">
            <Label htmlFor="run-model" className="text-xs text-zinc-400">
              Model
            </Label>
            <ProviderModelSelect
              id="run-model"
              workspaceId={workspaceId}
              provider={provider}
              model={model}
              onModelChange={onModelChange}
              onUserModelChange={(next) => {
                void applyTeamBrain(provider, next);
              }}
              credentialsRevision={credentialsRevision}
              ollamaMode={ollamaMode}
              disabled={syncing}
            />
            {syncing && (
              <p className="text-[11px] leading-snug text-zinc-500">
                Updating every teammate…
              </p>
            )}
            {syncError ? (
              <p className="text-[11px] leading-snug text-red-300">{syncError}</p>
            ) : null}
          </div>
        )}

        {current && provider !== "mock" && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-500">
              {current.ready ? (
                <>
                  Key found via <span className="text-emerald-400">{current.source}</span>
                  {current.activeCredentialLabel ? (
                    <>
                      {" "}
                      ({current.activeCredentialLabel}
                      {current.isDefaultCredential ? ", active" : ""})
                    </>
                  ) : null}
                </>
              ) : (
                <span className="text-amber-400">
                  No key yet — add one under Your API keys, then come back here.
                </span>
              )}
            </p>
            {provider === "ollama" && current.ready && (
              <p className="text-[11px] leading-snug text-zinc-500">
                Saved both local and cloud? Click{" "}
                <span className="text-zinc-300">Use</span> on the one you want under Your API
                keys. Most people should stay on cloud.
              </p>
            )}
            {provider === "openrouter" && current.ready && (
              <TestKeyButton
                workspaceId={workspaceId}
                provider="openrouter"
                credentialId={current.activeCredentialId}
                onResult={onProviderTestResult}
              />
            )}
            {provider === "ollama" && current.ready && ollamaMode === "cloud" && (
              <TestKeyButton
                workspaceId={workspaceId}
                provider="ollama"
                credentialId={current.activeCredentialId}
                onResult={onProviderTestResult}
              />
            )}
            {provider === "anthropic" && current.ready && (
              <TestKeyButton
                workspaceId={workspaceId}
                provider="anthropic"
                credentialId={current.activeCredentialId}
                onResult={onProviderTestResult}
              />
            )}
          </div>
        )}
      </PanelContent>
    </Panel>
  );
}

function OllamaEndpointCard({
  mode,
  baseUrl,
  label,
}: {
  mode: OllamaEndpointMode | null;
  baseUrl?: string | null;
  label?: string | null;
}) {
  const title =
    mode === "cloud" ? "Cloud" : mode === "local" ? "This computer" : "Custom";
  const badgeVariant =
    mode === "cloud" ? "building" : mode === "local" ? "done" : "default";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Where requests go
        </span>
        <Badge variant={badgeVariant}>{title}</Badge>
      </div>
      <p className="mt-1.5 truncate text-sm text-zinc-200">
        {mode === "local"
          ? "Ollama app on this computer"
          : mode === "cloud"
            ? "Ollama Cloud"
            : baseUrl || "Custom Ollama address"}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-zinc-500">
        {mode === "cloud"
          ? "Uses your cloud key from ollama.com."
          : mode === "local"
            ? "Uses the Ollama app on this computer — no cloud key needed."
            : "Using the address saved on your active key."}
        {label ? (
          <>
            {" "}
            Active key: <span className="text-zinc-400">{label}</span>.
          </>
        ) : null}
      </p>
    </div>
  );
}

function TestKeyButton({
  workspaceId,
  provider,
  credentialId,
  onResult,
}: {
  workspaceId: string;
  provider: "openrouter" | "ollama" | "anthropic";
  credentialId?: string | null;
  onResult?: (ok: boolean) => void;
}) {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const label =
    provider === "ollama"
      ? "Test Ollama Cloud key"
      : provider === "anthropic"
        ? "Test Anthropic key"
        : "Test OpenRouter key";

  return (
    <div>
      <button
        type="button"
        className="text-xs text-indigo-400 hover:text-indigo-300"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setResult(null);
          try {
            const res = await fetch("/api/providers/test", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ workspaceId, provider }),
            });
            const json = await readResponseJson<{
              ok?: boolean;
              message?: string;
              error?: string;
              source?: string;
              probes?: Record<string, { status?: number }>;
            }>(res);
            const detail = json.message ?? json.error ?? "Test failed";
            const probeBits =
              json.probes && typeof json.probes === "object"
                ? ` [models=${json.probes.models?.status ?? "?"} tags=${json.probes.tags?.status ?? "?"} api/chat=${json.probes.nativeChat?.status ?? "?"} v1/chat=${json.probes.openaiChat?.status ?? "?"}]`
                : "";
            const ok = Boolean(json.ok);
            writeProviderTestOk(workspaceId, provider, credentialId, ok);
            onResult?.(ok);
            setResult(ok ? `✓ ${detail} (${json.source})` : `✗ ${detail}${probeBits}`);
          } catch {
            writeProviderTestOk(workspaceId, provider, credentialId, false);
            onResult?.(false);
            setResult("✗ Test failed");
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading ? "Testing…" : label}
      </button>
      {result && <p className="mt-1 text-xs text-zinc-400">{result}</p>}
    </div>
  );
}
