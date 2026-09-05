"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Key } from "lucide-react";
import {
  isOllamaCloudBaseUrl,
  isOllamaLocalBaseUrl,
  OLLAMA_CLOUD_BASE_URL,
  OLLAMA_LOCAL_BASE_URL,
} from "@/lib/ollama-endpoints";
import { looksLikeIncompleteOllamaApiKey } from "@/lib/ollama-models";
import { useAllowLocalOllama } from "@/lib/use-allow-local-ollama";

const PROVIDERS = [
  { id: "openrouter", label: "OpenRouter" },
  { id: "google", label: "Google Gemini" },
  { id: "ollama", label: "Ollama" },
  { id: "openai_compatible", label: "OpenAI-compatible" },
] as const;

const OPENAI_COMPATIBLE_DEFAULT_BASE_URL = "https://api.openai.com/v1";

type SavedCred = {
  id: string;
  provider: string;
  label: string;
  baseUrl?: string | null;
  isDefault?: boolean;
};

type CredentialsFormProps = {
  workspaceId: string;
  onSave: (data: {
    provider: string;
    label: string;
    apiKey?: string;
    baseUrl?: string;
  }) => Promise<void>;
  /** Fired after save / Use / Remove so dependent panels can refresh. */
  onCredentialsChange?: () => void;
};

export function CredentialsForm({
  workspaceId,
  onSave,
  onCredentialsChange,
}: CredentialsFormProps) {
  const [provider, setProvider] = useState("openrouter");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(OLLAMA_CLOUD_BASE_URL);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SavedCred[]>([]);
  const allowLocalOllama = useAllowLocalOllama();

  const reload = useCallback(() => {
    fetch(`/api/credentials?workspaceId=${workspaceId}`)
      .then((response) => {
        if (!response.ok) throw new Error("Could not load credentials");
        return response.json();
      })
      .then(setSaved)
      .catch(() => setError("Could not load credentials"));
  }, [workspaceId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const needsBaseUrl =
    provider === "openai_compatible" || (provider === "ollama" && allowLocalOllama);
  const ollamaFormBaseUrl =
    provider === "ollama" && !allowLocalOllama ? OLLAMA_CLOUD_BASE_URL : baseUrl;
  const hasActiveLocalOllama = saved.some(
    (c) =>
      c.provider === "ollama" &&
      c.isDefault &&
      isOllamaLocalBaseUrl(c.baseUrl),
  );

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle className="flex items-center gap-2">
          <Key size={14} />
          Your API keys
        </PanelTitle>
      </PanelHeader>
      <PanelContent>
        <p className="mb-3 text-xs text-zinc-500">
          Add a key for a real model. For Ollama on the live site, use an{" "}
          <span className="text-zinc-300">Ollama Cloud</span> key (full{" "}
          <code className="text-zinc-400">id.secret</code>). Skip only if you want Mock.
        </p>
        {!allowLocalOllama && hasActiveLocalOllama && (
          <p className="mb-3 text-[11px] leading-snug text-amber-400/90">
            Your active Ollama key is set to this computer, but the live website can’t use
            local models. Save or click Use on a cloud key below.
          </p>
        )}
        {saved.length > 0 && (
          <ul className="mb-3 space-y-1 text-xs text-zinc-400">
            {saved.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      c.isDefault ? "bg-emerald-400" : "bg-zinc-600"
                    }`}
                  />
                  <span className="truncate">
                    {c.label} ({c.provider}
                    {c.provider === "ollama" && c.baseUrl
                      ? isOllamaCloudBaseUrl(c.baseUrl)
                        ? " · cloud"
                        : isOllamaLocalBaseUrl(c.baseUrl)
                          ? " · local"
                          : ` · ${c.baseUrl}`
                      : c.baseUrl
                        ? ` · ${c.baseUrl}`
                        : ""}
                    )
                    {c.isDefault ? " · active" : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {!c.isDefault && (
                    <button
                      type="button"
                      className="text-indigo-400 hover:text-indigo-300"
                      onClick={async () => {
                        const response = await fetch("/api/credentials", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "set_default", id: c.id }),
                        });
                        if (!response.ok) {
                          setError("Could not set active credential");
                          return;
                        }
                        setError("");
                        setMessage("Active credential updated");
                        reload();
                        onCredentialsChange?.();
                      }}
                    >
                      Use
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-red-400 hover:text-red-300"
                    onClick={async () => {
                      const response = await fetch(`/api/credentials?id=${c.id}`, {
                        method: "DELETE",
                      });
                      if (!response.ok) {
                        setError("Could not remove credential");
                        return;
                      }
                      setError("");
                      reload();
                      onCredentialsChange?.();
                    }}
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            setMessage("");
            setError("");

            if (
              provider === "ollama" &&
              (!allowLocalOllama || isOllamaCloudBaseUrl(ollamaFormBaseUrl)) &&
              !apiKey.trim()
            ) {
              setError("API key is required for Ollama Cloud");
              setSaving(false);
              return;
            }

            if (
              provider === "ollama" &&
              (!allowLocalOllama || isOllamaCloudBaseUrl(ollamaFormBaseUrl)) &&
              looksLikeIncompleteOllamaApiKey(apiKey)
            ) {
              setError(
                "That key looks incomplete. Paste the full id.secret from ollama.com/settings/keys before saving.",
              );
              setSaving(false);
              return;
            }

            try {
              const resolvedBaseUrl =
                provider === "ollama"
                  ? allowLocalOllama
                    ? baseUrl.trim() || OLLAMA_CLOUD_BASE_URL
                    : OLLAMA_CLOUD_BASE_URL
                  : needsBaseUrl
                    ? baseUrl.trim() || undefined
                    : undefined;
              await onSave({
                provider,
                label: label || provider,
                apiKey: apiKey || undefined,
                baseUrl: resolvedBaseUrl,
              });
              setApiKey("");
              setMessage("Saved");
              reload();
              onCredentialsChange?.();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to save");
            }
            setSaving(false);
          }}
        >
          <select
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            value={provider}
            onChange={(e) => {
              const next = e.target.value;
              setProvider(next);
              setError("");
              setMessage("");
              if (next === "ollama") setBaseUrl(OLLAMA_CLOUD_BASE_URL);
              if (next === "openai_compatible") {
                setBaseUrl(OPENAI_COMPATIBLE_DEFAULT_BASE_URL);
              }
            }}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            placeholder="Label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <input
            type="password"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            placeholder={
              provider === "ollama"
                ? "Ollama Cloud API key (paste full id.secret)"
                : "API key"
            }
            value={apiKey}
            onChange={(e) => {
              const next = e.target.value;
              setApiKey(next);
              if (
                provider === "ollama" &&
                next.trim() &&
                (isOllamaLocalBaseUrl(baseUrl) || !baseUrl.trim())
              ) {
                setBaseUrl(OLLAMA_CLOUD_BASE_URL);
              }
            }}
            required={provider !== "ollama"}
            autoComplete="off"
          />
          {provider === "ollama" && allowLocalOllama && (
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                onClick={() => {
                  setBaseUrl(OLLAMA_LOCAL_BASE_URL);
                  setApiKey("");
                  setError("");
                }}
              >
                Use local
              </button>
              <button
                type="button"
                className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                onClick={() => {
                  setBaseUrl(OLLAMA_CLOUD_BASE_URL);
                  setError("");
                }}
              >
                Use cloud
              </button>
            </div>
          )}
          {needsBaseUrl && (
            <input
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
              placeholder="Base URL"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              required
            />
          )}
          {provider === "ollama" && (
            <p className="text-[11px] leading-snug text-zinc-500">
              {allowLocalOllama ? (
                <>
                  <span className="text-zinc-300">Use cloud</span>: paste your full key from
                  ollama.com/settings/keys.{" "}
                  <span className="text-zinc-300">Use local</span>: leave the key empty and
                  keep the Ollama app open on this computer.
                </>
              ) : (
                <>
                  Paste your full key from ollama.com/settings/keys. Local Ollama on your
                  computer isn’t available on the live website yet — use cloud for now.
                </>
              )}
            </p>
          )}
          {provider === "ollama" &&
            isOllamaCloudBaseUrl(baseUrl) &&
            looksLikeIncompleteOllamaApiKey(apiKey) && (
              <p className="text-[11px] leading-snug text-amber-400/90">
                That key looks incomplete. Copy the entire value once when Ollama shows it —
                a truncated key can list models but chat returns Unauthorized.
              </p>
            )}
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "Saving…" : "Save key"}
          </Button>
          {message && <p className="text-xs text-emerald-400">{message}</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </form>
      </PanelContent>
    </Panel>
  );
}
