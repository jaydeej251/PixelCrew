"use client";

import { useEffect, useState } from "react";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Cpu } from "lucide-react";

type ProviderStatus = {
  provider: string;
  label: string;
  ready: boolean;
  source: "credential" | "env" | "none";
  defaultModel: string;
};

type RunSettingsProps = {
  workspaceId: string;
  provider: string;
  model: string;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
};

export function RunSettings({
  workspaceId,
  provider,
  model,
  onProviderChange,
  onModelChange,
}: RunSettingsProps) {
  const [statuses, setStatuses] = useState<ProviderStatus[]>([]);

  useEffect(() => {
    fetch(`/api/providers/status?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((d) => setStatuses(d.providers ?? []));
  }, [workspaceId]);

  const current = statuses.find((s) => s.provider === provider);

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle className="flex items-center gap-2">
          <Cpu size={14} />
          Which AI to use
        </PanelTitle>
      </PanelHeader>
      <PanelContent className="space-y-2">
        <p className="text-xs text-zinc-500">
          Mock is free and fine for trying the product. Pick another option after you add a key
          below.
        </p>
        <select
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
          value={provider}
          onChange={(e) => {
            onProviderChange(e.target.value);
            const next = statuses.find((s) => s.provider === e.target.value);
            if (next) onModelChange(next.defaultModel);
          }}
        >
          {statuses.map((s) => (
            <option key={s.provider} value={s.provider}>
              {s.label}
              {s.provider !== "mock" && (s.ready ? " ✓" : " (no key)")}
            </option>
          ))}
        </select>
        <input
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
          placeholder="Model name"
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
        />
        {current && provider !== "mock" && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-500">
              {current.ready ? (
                <>
                  Key found via <span className="text-emerald-400">{current.source}</span>
                </>
              ) : (
                <span className="text-amber-400">
                  No key yet — add one under Your API keys, then come back here.
                </span>
              )}
            </p>
            {provider === "openrouter" && current.ready && (
              <TestKeyButton workspaceId={workspaceId} />
            )}
          </div>
        )}
      </PanelContent>
    </Panel>
  );
}

function TestKeyButton({ workspaceId }: { workspaceId: string }) {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
            body: JSON.stringify({ workspaceId, provider: "openrouter" }),
          });
          const json = await res.json();
          setResult(json.ok ? `✓ ${json.message} (${json.source})` : `✗ ${json.message}`);
          setLoading(false);
        }}
      >
        {loading ? "Testing…" : "Test OpenRouter key"}
      </button>
      {result && <p className="mt-1 text-xs text-zinc-400">{result}</p>}
    </div>
  );
}
