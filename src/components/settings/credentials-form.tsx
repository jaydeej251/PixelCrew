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

const PROVIDERS = [
  { id: "openrouter", label: "OpenRouter" },
  { id: "google", label: "Google Gemini" },
  { id: "ollama", label: "Ollama (local or cloud)" },
  { id: "openai_compatible", label: "OpenAI-compatible" },
] as const;

const OPENAI_COMPATIBLE_DEFAULT_BASE_URL = "https://api.openai.com/v1";

type SavedCred = { id: string; provider: string; label: string; baseUrl?: string | null };

type CredentialsFormProps = {
  workspaceId: string;
  onSave: (data: {
    provider: string;
    label: string;
    apiKey?: string;
    baseUrl?: string;
  }) => Promise<void>;
};

export function CredentialsForm({ workspaceId, onSave }: CredentialsFormProps) {
  const [provider, setProvider] = useState("openrouter");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(OLLAMA_LOCAL_BASE_URL);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SavedCred[]>([]);

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

  const needsBaseUrl = provider === "ollama" || provider === "openai_compatible";

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
          Optional. Add a key if you want a real model instead of Mock.
        </p>
        {saved.length > 0 && (
          <ul className="mb-3 space-y-1 text-xs text-zinc-400">
            {saved.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                  <span className="truncate">
                    {c.label} ({c.provider}
                    {c.baseUrl ? ` · ${c.baseUrl}` : ""})
                  </span>
                </span>
                <button
                  type="button"
                  className="shrink-0 text-red-400 hover:text-red-300"
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
                  }}
                >
                  Remove
                </button>
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
              isOllamaCloudBaseUrl(baseUrl) &&
              !apiKey.trim()
            ) {
              setError("API key is required for Ollama Cloud");
              setSaving(false);
              return;
            }

            try {
              await onSave({
                provider,
                label: label || provider,
                apiKey: apiKey || undefined,
                baseUrl: needsBaseUrl ? baseUrl.trim() || undefined : undefined,
              });
              setApiKey("");
              setMessage("Saved");
              reload();
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
              if (next === "ollama") setBaseUrl(OLLAMA_LOCAL_BASE_URL);
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
                ? "API key (required for Ollama Cloud)"
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
          {provider === "ollama" && (
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
              Local: leave the key empty and use {OLLAMA_LOCAL_BASE_URL}. Cloud: paste your
              ollama.com API key (Base URL becomes {OLLAMA_CLOUD_BASE_URL}).
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
