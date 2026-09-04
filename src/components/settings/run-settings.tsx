"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Cpu } from "lucide-react";
import {
  getOllamaDefaultModelForMode,
  getOllamaEndpointMode,
  getOllamaSuggestedModels,
  ollamaModelHasLocalCloudSuffix,
  ollamaModelLooksMismatched,
  type OllamaEndpointMode,
} from "@/lib/ollama-models";
import { writeProviderTestOk } from "@/lib/run-readiness";

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
  /** Bump when credentials change so endpoint/status stay in sync. */
  credentialsRevision?: number;
  /** Fired after a successful / failed live key probe (for Start gating). */
  onProviderTestResult?: (ok: boolean) => void;
};

export function RunSettings({
  workspaceId,
  provider,
  model,
  onProviderChange,
  onModelChange,
  credentialsRevision = 0,
  onProviderTestResult,
}: RunSettingsProps) {
  const [statuses, setStatuses] = useState<ProviderStatus[]>([]);

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
  const suggestions = getOllamaSuggestedModels(ollamaMode);
  const mismatched =
    provider === "ollama" && ollamaModelLooksMismatched(model, ollamaMode);

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
          Pick a provider, then a model. For Ollama, the active key under{" "}
          <span className="text-zinc-400">Your API keys</span> chooses cloud or local —
          the model field stays required either way.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="run-provider" className="text-xs text-zinc-400">
            Provider
          </Label>
          <select
            id="run-provider"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            value={provider}
            onChange={(e) => {
              const nextId = e.target.value;
              onProviderChange(nextId);
              const next = statuses.find((s) => s.provider === nextId);
              if (!next) return;
              if (nextId === "ollama") {
                const mode = getOllamaEndpointMode(next.activeBaseUrl);
                onModelChange(getOllamaDefaultModelForMode(mode));
              } else {
                onModelChange(next.defaultModel);
              }
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
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="run-model" className="text-xs text-zinc-400">
                Model
              </Label>
              {ollamaMode && ollamaMode !== "custom" && (
                <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                  {ollamaMode === "cloud" ? "Cloud catalog" : "Local pulls"}
                </span>
              )}
            </div>
            <Input
              id="run-model"
              placeholder={modelPlaceholder(provider, ollamaMode)}
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
            />
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {suggestions.map((name) => {
                  const active = model.trim() === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => onModelChange(name)}
                      className={`rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
                        active
                          ? "border-indigo-500/60 bg-indigo-500/15 text-indigo-200"
                          : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            )}
            {mismatched && (
              <p className="text-[11px] leading-snug text-amber-400/90">
                {ollamaMode === "cloud" && ollamaModelHasLocalCloudSuffix(model)
                  ? "Drop the -cloud suffix here. That name is for local Ollama (localhost). Direct ollama.com uses gpt-oss:20b, not gpt-oss:20b-cloud."
                  : ollamaMode === "cloud"
                    ? "That name is a common local pull. On cloud, pick a model from the chips above or ollama.com/search."
                    : "That name is a common cloud model. Local Ollama needs a model you’ve already pulled."}
              </p>
            )}
            {!mismatched && ollamaMode === "cloud" && (
              <p className="text-[11px] leading-snug text-zinc-500">
                Direct ollama.com API — no <code className="text-zinc-400">-cloud</code> suffix
                (that’s only for local offload). Key authenticates; chips are the model name we send.
              </p>
            )}
            {!mismatched && ollamaMode === "local" && (
              <p className="text-[11px] leading-snug text-zinc-500">
                Local needs no API key. Use a model from{" "}
                <code className="text-zinc-400">ollama list</code>, or click a starter above.
              </p>
            )}
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
                keys — this panel updates the endpoint badge above.
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
          </div>
        )}
      </PanelContent>
    </Panel>
  );
}

function modelPlaceholder(
  provider: string,
  mode: OllamaEndpointMode | null,
): string {
  if (provider === "ollama") {
    if (mode === "cloud") return "e.g. gpt-oss:20b";
    if (mode === "local") return "e.g. qwen2.5-coder:14b";
    return "Model name";
  }
  if (provider === "openrouter") return "e.g. openai/gpt-4o-mini";
  if (provider === "google") return "e.g. gemini-2.0-flash";
  return "Model name";
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
    mode === "cloud" ? "Cloud" : mode === "local" ? "Local" : "Custom endpoint";
  const badgeVariant =
    mode === "cloud" ? "building" : mode === "local" ? "done" : "default";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Endpoint
        </span>
        <Badge variant={badgeVariant}>{title}</Badge>
      </div>
      <p className="mt-1.5 truncate text-sm text-zinc-200">
        {baseUrl || "Default Ollama endpoint"}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-zinc-500">
        {mode === "cloud"
          ? "Requests go to ollama.com with your API key."
          : mode === "local"
            ? "Requests go to your machine — no cloud key required."
            : "Using the base URL on the active credential."}
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
  provider: "openrouter" | "ollama";
  credentialId?: string | null;
  onResult?: (ok: boolean) => void;
}) {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const label = provider === "ollama" ? "Test Ollama Cloud key" : "Test OpenRouter key";

  return (
    <div>
      <button
        type="button"
        className="text-xs text-indigo-400 hover:text-indigo-300"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setResult(null);
          const res = await fetch("/api/providers/test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspaceId, provider }),
          });
          const json = await res.json();
          const detail = json.message ?? json.error ?? "Test failed";
          const probeBits =
            json.probes && typeof json.probes === "object"
              ? ` [models=${json.probes.models?.status ?? "?"} tags=${json.probes.tags?.status ?? "?"} api/chat=${json.probes.nativeChat?.status ?? "?"} v1/chat=${json.probes.openaiChat?.status ?? "?"}]`
              : "";
          const ok = Boolean(json.ok);
          writeProviderTestOk(workspaceId, provider, credentialId, ok);
          onResult?.(ok);
          setResult(ok ? `✓ ${detail} (${json.source})` : `✗ ${detail}${probeBits}`);
          setLoading(false);
        }}
      >
        {loading ? "Testing…" : label}
      </button>
      {result && <p className="mt-1 text-xs text-zinc-400">{result}</p>}
    </div>
  );
}
