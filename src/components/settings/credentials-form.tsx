"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Key } from "lucide-react";

const PROVIDERS = [
  { id: "openrouter", label: "OpenRouter" },
  { id: "google", label: "Google Gemini" },
  { id: "ollama", label: "Ollama (local)" },
  { id: "openai_compatible", label: "OpenAI-compatible" },
] as const;

type SavedCred = { id: string; provider: string; label: string };

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
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:11434/v1");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState<SavedCred[]>([]);

  const reload = useCallback(() => {
    fetch(`/api/credentials?workspaceId=${workspaceId}`)
      .then((response) => {
        if (!response.ok) throw new Error("Could not load credentials");
        return response.json();
      })
      .then(setSaved);
  }, [workspaceId]);

  useEffect(() => {
    reload();
  }, [reload]);

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
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {c.label} ({c.provider})
                </span>
                <button
                  type="button"
                  className="text-red-400 hover:text-red-300"
                  onClick={async () => {
                    await fetch(`/api/credentials?id=${c.id}`, { method: "DELETE" });
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
            try {
              await onSave({
                provider,
                label: label || provider,
                apiKey: apiKey || undefined,
                baseUrl: provider === "ollama" ? baseUrl : undefined,
              });
              setApiKey("");
              setMessage("Saved");
              reload();
            } catch {
              setMessage("Failed to save");
            }
            setSaving(false);
          }}
        >
          <select
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
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
          {provider !== "ollama" && (
            <input
              type="password"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
              placeholder="API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          )}
          {provider === "ollama" && (
            <input
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
              placeholder="Base URL"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          )}
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "Saving…" : "Save key"}
          </Button>
          {message && <p className="text-xs text-emerald-400">{message}</p>}
        </form>
      </PanelContent>
    </Panel>
  );
}
