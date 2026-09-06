"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Cpu, RefreshCw } from "lucide-react";
import {
  getOllamaDefaultModelForMode,
  getOllamaEndpointMode,
  getOllamaSuggestedModels,
  ollamaModelHasLocalCloudSuffix,
  ollamaModelLooksMismatched,
  type OllamaEndpointMode,
} from "@/lib/ollama-models";
import { writeProviderTestOk } from "@/lib/run-readiness";
import { readResponseJson } from "@/lib/http-json";

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
  const cloudSuggestions = getOllamaSuggestedModels(ollamaMode === "cloud" ? "cloud" : null);
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
          Pick who builds with you, then which AI brain they use. For Ollama, choose{" "}
          <span className="text-zinc-400">Use cloud</span> or{" "}
          <span className="text-zinc-400">Use local</span> under Your API keys — most people
          should use cloud.
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
              {ollamaMode === "cloud" && (
                <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                  Cloud catalog
                </span>
              )}
              {ollamaMode === "local" && (
                <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                  On this computer
                </span>
              )}
            </div>
            <Input
              id="run-model"
              placeholder={modelPlaceholder(provider, ollamaMode)}
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
            />
            {ollamaMode === "local" ? (
              <LocalOllamaModelChips
                key={`${workspaceId}-${credentialsRevision}`}
                workspaceId={workspaceId}
                model={model}
                onModelChange={onModelChange}
                mismatched={mismatched}
              />
            ) : (
              <>
                {cloudSuggestions.length > 0 && (
                  <ModelChipRow
                    names={cloudSuggestions}
                    model={model}
                    onModelChange={onModelChange}
                  />
                )}
                {mismatched && (
                  <p className="text-[11px] leading-snug text-amber-400/90">
                    {ollamaMode === "cloud" && ollamaModelHasLocalCloudSuffix(model)
                      ? "Remove the “-cloud” ending from the name when using Ollama Cloud (example: gpt-oss:20b)."
                      : ollamaMode === "cloud"
                        ? "That name is usually for the Ollama app on your computer. On cloud, pick one of the options above or search on ollama.com."
                        : "That name is usually for Ollama Cloud. On this computer, pick a model you’ve already downloaded in the Ollama app."}
                  </p>
                )}
                {!mismatched && ollamaMode === "cloud" && (
                  <p className="text-[11px] leading-snug text-zinc-500">
                    Uses your Ollama Cloud key. Tap a chip above, or type a model name from
                    ollama.com.
                  </p>
                )}
              </>
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
                keys. Most people should stay on cloud.
              </p>
            )}
            {provider === "openrouter" && current.ready && (
              <>
                <p className="text-[11px] leading-snug text-zinc-500">
                  Browse models on{" "}
                  <a
                    href="https://openrouter.ai/models"
                    target="_blank"
                    rel="noreferrer"
                    className="text-zinc-300 underline-offset-2 hover:underline"
                  >
                    openrouter.ai/models
                  </a>
                  , then paste the model id here — OpenRouter is the catalog; we just need the
                  name for this run.
                </p>
                <TestKeyButton
                  workspaceId={workspaceId}
                  provider="openrouter"
                  credentialId={current.activeCredentialId}
                  onResult={onProviderTestResult}
                />
              </>
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
  if (provider === "anthropic") return "e.g. claude-3-5-haiku-latest";
  if (provider === "google") return "e.g. gemini-2.0-flash";
  return "Model name";
}

function ModelChipRow({
  names,
  model,
  onModelChange,
}: {
  names: readonly string[];
  model: string;
  onModelChange: (model: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 pt-0.5">
      {names.map((name) => {
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
  );
}

type LocalModelsState =
  | { status: "loading"; models: string[] }
  | { status: "ready"; models: string[] }
  | { status: "empty"; models: [] }
  | { status: "error"; models: string[]; message: string };

function LocalOllamaModelChips({
  workspaceId,
  model,
  onModelChange,
  mismatched,
}: {
  workspaceId: string;
  model: string;
  onModelChange: (model: string) => void;
  mismatched: boolean;
}) {
  const starters = getOllamaSuggestedModels("local");
  const [state, setState] = useState<LocalModelsState>({
    status: "loading",
    models: [],
  });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    fetch(
      `/api/providers/ollama/models?workspaceId=${encodeURIComponent(workspaceId)}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (res) => {
        const json = (await res.json()) as {
          ok?: boolean;
          models?: string[];
          message?: string;
          error?: string;
        };
        if (controller.signal.aborted) return;

        if (!res.ok || !json.ok) {
          setState({
            status: "error",
            models: [],
            message:
              json.message ??
              json.error ??
              "We couldn’t load your local models right now.",
          });
          return;
        }

        const models = Array.isArray(json.models) ? json.models : [];
        if (models.length === 0) {
          setState({ status: "empty", models: [] });
          return;
        }
        setState({ status: "ready", models });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          models: [],
          message:
            err instanceof Error
              ? err.message
              : "We couldn’t load your local models right now.",
        });
      });

    return () => controller.abort();
  }, [workspaceId, refreshKey]);

  const showStarters =
    state.status === "error" || state.status === "loading" || state.status === "empty";
  const chipNames =
    state.status === "ready"
      ? state.models
      : state.status === "loading" && state.models.length > 0
        ? state.models
        : showStarters
          ? starters
          : [];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="text-[11px] text-zinc-500">
          {state.status === "ready"
            ? `${state.models.length} model${state.models.length === 1 ? "" : "s"} on this computer`
            : state.status === "loading"
              ? "Looking for the Ollama app…"
              : state.status === "empty"
                ? "No models downloaded yet"
                : "Ollama isn’t ready yet"}
        </span>
        <button
          type="button"
          onClick={() => {
            setState((prev) => ({
              status: "loading",
              models: prev.status === "ready" ? prev.models : [],
            }));
            setRefreshKey((n) => n + 1);
          }}
          disabled={state.status === "loading"}
          className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            size={11}
            className={state.status === "loading" ? "animate-spin" : undefined}
            aria-hidden
          />
          {state.status === "loading" ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {chipNames.length > 0 && (
        <ModelChipRow names={chipNames} model={model} onModelChange={onModelChange} />
      )}

      {state.status === "ready" && (
        <p className="text-[11px] leading-snug text-zinc-500">
          These are already on your computer — no cloud key needed. After you download a new
          model in the Ollama app, click Refresh.
        </p>
      )}
      {state.status === "empty" && (
        <p className="text-[11px] leading-snug text-amber-400/90">
          Ollama is open, but no models are downloaded yet. In the Ollama app, download one
          (try <span className="text-zinc-200">qwen2.5-coder</span>), then click Refresh. The
          chips below are suggestions until something is downloaded.
        </p>
      )}
      {state.status === "error" && (
        <p className="text-[11px] leading-snug text-amber-400/90">{state.message}</p>
      )}
      {mismatched && (state.status === "ready" || state.status === "empty") && (
        <p className="text-[11px] leading-snug text-amber-400/90">
          That name is usually for Ollama Cloud. On this computer, pick a model you’ve
          already downloaded in the Ollama app.
        </p>
      )}
    </div>
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
