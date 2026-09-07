"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  coerceModelToChoices,
  resolveModelChoices,
} from "@/lib/provider-models";
import type { OllamaEndpointMode } from "@/lib/ollama-models";

type FetchState =
  | { status: "idle" | "loading" | "ready" | "empty"; models: string[] }
  | { status: "error"; models: string[]; message: string };

type ProviderModelSelectProps = {
  id?: string;
  workspaceId: string;
  provider: string;
  model: string;
  onModelChange: (model: string) => void;
  credentialsRevision?: number;
  ollamaMode?: OllamaEndpointMode | null;
  className?: string;
  disabled?: boolean;
  /** Fired only when the user picks from the dropdown (not coerce/sync). */
  onUserModelChange?: (model: string) => void;
};

/**
 * Model picker: curated catalog or fetched Ollama installs — never free-typed ids.
 */
export function ProviderModelSelect({
  id,
  workspaceId,
  provider,
  model,
  onModelChange,
  credentialsRevision = 0,
  ollamaMode = null,
  className =
    "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100",
  disabled = false,
  onUserModelChange,
}: ProviderModelSelectProps) {
  const needsFetch = provider === "ollama" && ollamaMode === "local";
  const [fetchState, setFetchState] = useState<FetchState>({
    status: "idle",
    models: [],
  });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!needsFetch) {
      setFetchState({ status: "idle", models: [] });
      return;
    }

    const controller = new AbortController();
    setFetchState((prev) => ({
      status: "loading",
      models: prev.status === "ready" ? prev.models : [],
    }));

    fetch(
      `/api/providers/ollama/models?workspaceId=${encodeURIComponent(workspaceId)}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          models?: string[];
          message?: string;
          error?: string;
        } | null;
        if (controller.signal.aborted) return;

        if (!res.ok || !json?.ok) {
          setFetchState({
            status: "error",
            models: [],
            message:
              json?.message ??
              json?.error ??
              "We couldn’t load your local models right now.",
          });
          return;
        }

        const models = Array.isArray(json.models) ? json.models : [];
        setFetchState(
          models.length === 0
            ? { status: "empty", models: [] }
            : { status: "ready", models },
        );
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setFetchState({
          status: "error",
          models: [],
          message:
            err instanceof Error
              ? err.message
              : "We couldn’t load your local models right now.",
        });
      });

    return () => controller.abort();
  }, [needsFetch, workspaceId, credentialsRevision, refreshKey]);

  const fetched =
    needsFetch && fetchState.status === "ready" ? fetchState.models : null;

  const choices = useMemo(() => {
    return resolveModelChoices({
      provider,
      ollamaMode,
      fetchedOllamaModels: fetched,
    });
  }, [provider, ollamaMode, fetched]);

  useEffect(() => {
    if (provider === "mock") {
      if (model !== "mock") onModelChange("mock");
      return;
    }
    if (choices.length === 0) return;
    const next = coerceModelToChoices(model, choices);
    if (next !== model) onModelChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snap when catalog/provider changes
  }, [provider, choices.join("|"), ollamaMode, needsFetch, fetchState.status]);

  if (provider === "mock") return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
          {provider === "ollama" && ollamaMode === "local"
            ? "On this computer"
            : provider === "ollama" && ollamaMode === "cloud"
              ? "Cloud catalog"
              : "Model catalog"}
        </span>
        {needsFetch && (
          <button
            type="button"
            onClick={() => setRefreshKey((n) => n + 1)}
            disabled={fetchState.status === "loading" || disabled}
            className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              size={11}
              className={fetchState.status === "loading" ? "animate-spin" : undefined}
              aria-hidden
            />
            {fetchState.status === "loading" ? "Refreshing…" : "Refresh"}
          </button>
        )}
      </div>

      <select
        id={id}
        className={className}
        value={choices.includes(model) ? model : (choices[0] ?? "")}
        disabled={disabled || choices.length === 0}
        onChange={(e) => {
          const next = e.target.value;
          onModelChange(next);
          onUserModelChange?.(next);
        }}
        required
      >
        {choices.length === 0 ? (
          <option value="">No models available</option>
        ) : (
          choices.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))
        )}
      </select>

      {needsFetch && fetchState.status === "loading" && (
        <p className="text-[11px] leading-snug text-zinc-500">
          Looking for models on this computer…
        </p>
      )}
      {needsFetch && fetchState.status === "ready" && (
        <p className="text-[11px] leading-snug text-zinc-500">
          {fetchState.models.length} model
          {fetchState.models.length === 1 ? "" : "s"} from the Ollama app — pick one, no
          typing.
        </p>
      )}
      {needsFetch && fetchState.status === "empty" && (
        <p className="text-[11px] leading-snug text-amber-400/90">
          Ollama is open, but nothing is downloaded yet. Pull a model in the Ollama app, then
          Refresh. Starters are listed until then.
        </p>
      )}
      {needsFetch && fetchState.status === "error" && (
        <p className="text-[11px] leading-snug text-amber-400/90">{fetchState.message}</p>
      )}
      {provider === "ollama" && ollamaMode === "cloud" && (
        <p className="text-[11px] leading-snug text-zinc-500">
          Pick a Cloud catalog model. Switch to Use local under Your API keys to load installs
          from this computer.
        </p>
      )}
      {provider === "openrouter" && (
        <p className="text-[11px] leading-snug text-zinc-500">
          Common OpenRouter ids. Add more to the catalog in a later update if you need others.
        </p>
      )}
    </div>
  );
}
