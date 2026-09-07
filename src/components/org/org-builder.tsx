"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Pencil, Plus, Trash2, Users, X } from "lucide-react";
import type { PositionKey } from "@/lib/constants";
import { DEFAULT_JOB_BOUNDARIES, POSITIONS } from "@/lib/constants";

type Agent = {
  id: string;
  name: string;
  position: string;
  positionLabel: string;
  jobBoundary: string;
  avatarColor: string;
  provider?: string;
  model?: string;
  department?: { name: string } | null;
};

type Template = { id: string; name: string; description: string };

type HirePayload = {
  name: string;
  position: PositionKey;
  jobBoundary: string;
  provider: string;
  model: string;
};

type ProviderOption = {
  provider: string;
  label: string;
  ready: boolean;
  defaultModel: string;
};

type OrgBuilderProps = {
  agents: Agent[];
  templates: Template[];
  /** Workspace run default — new hires inherit this until overridden. */
  defaultProvider: string;
  defaultModel: string;
  workspaceId: string;
  credentialsRevision?: number;
  onApplyTemplate: (templateId: string) => Promise<void>;
  onHire: (data: HirePayload) => Promise<void>;
  onUpdate: (id: string, data: HirePayload) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
};

const FALLBACK_PROVIDERS: ProviderOption[] = [
  { provider: "mock", label: "Mock (no API key)", ready: true, defaultModel: "mock" },
  {
    provider: "openrouter",
    label: "OpenRouter",
    ready: false,
    defaultModel: "openai/gpt-4o-mini",
  },
  {
    provider: "anthropic",
    label: "Anthropic (Claude)",
    ready: false,
    defaultModel: "claude-3-5-haiku-latest",
  },
  {
    provider: "google",
    label: "Google Gemini",
    ready: false,
    defaultModel: "gemini-2.0-flash",
  },
  {
    provider: "ollama",
    label: "Ollama (local or cloud)",
    ready: false,
    defaultModel: "llama3.2",
  },
];

function brainLabel(provider?: string, model?: string): string {
  if (!provider || provider === "mock") return "Default on Start";
  const short = (model || "").trim();
  if (!short) return provider;
  return short.length > 28 ? `${provider} · ${short.slice(0, 26)}…` : `${provider} · ${short}`;
}

export function OrgBuilder({
  agents,
  templates,
  defaultProvider,
  defaultModel,
  workspaceId,
  credentialsRevision = 0,
  onApplyTemplate,
  onHire,
  onUpdate,
  onRemove,
}: OrgBuilderProps) {
  const [hiring, setHiring] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [position, setPosition] = useState<PositionKey>("frontend_engineer");
  const [jobBoundary, setJobBoundary] = useState(DEFAULT_JOB_BOUNDARIES.frontend_engineer);
  const [provider, setProvider] = useState(defaultProvider);
  const [model, setModel] = useState(defaultModel);
  const [loading, setLoading] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [providers, setProviders] = useState<ProviderOption[]>(FALLBACK_PROVIDERS);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/providers/status?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then(async (r) => {
        const d = (await r.json().catch(() => null)) as {
          providers?: ProviderOption[];
        } | null;
        if (cancelled || !r.ok) return;
        const list = d?.providers ?? [];
        if (list.length > 0) setProviders(list);
      })
      .catch(() => {
        /* keep fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, credentialsRevision]);

  const providerOptions = (() => {
    if (providers.some((p) => p.provider === provider)) return providers;
    return [
      ...providers,
      {
        provider,
        label: provider,
        ready: false,
        defaultModel: model || "mock",
      },
    ];
  })();

  const selectedProvider = providerOptions.find((p) => p.provider === provider);
  const selectedNeedsKey =
    provider !== "mock" && selectedProvider && !selectedProvider.ready;

  const byPosition = agents.reduce<Record<string, Agent[]>>((acc, a) => {
    (acc[a.position] ??= []).push(a);
    return acc;
  }, {});

  const resetForm = () => {
    setHiring(false);
    setEditingId(null);
    setName("");
    setPosition("frontend_engineer");
    setJobBoundary(DEFAULT_JOB_BOUNDARIES.frontend_engineer);
    setProvider(defaultProvider);
    setModel(defaultModel);
    setFormError("");
  };

  const startEdit = (agent: Agent) => {
    setHiring(false);
    setEditingId(agent.id);
    setName(agent.name);
    setPosition(agent.position as PositionKey);
    setJobBoundary(agent.jobBoundary);
    setProvider(agent.provider && agent.provider !== "mock" ? agent.provider : defaultProvider);
    setModel(
      agent.provider && agent.provider !== "mock" && agent.model
        ? agent.model
        : defaultModel,
    );
    setFormError("");
  };

  const startHire = () => {
    setEditingId(null);
    setHiring(!hiring);
    setName("");
    setPosition("frontend_engineer");
    setJobBoundary(DEFAULT_JOB_BOUNDARIES.frontend_engineer);
    setProvider(defaultProvider);
    setModel(defaultModel);
    setFormError("");
  };

  const handlePositionChange = (next: PositionKey) => {
    setPosition(next);
    if (!editingId) {
      setJobBoundary(DEFAULT_JOB_BOUNDARIES[next]);
    }
  };

  const handleProviderChange = (nextId: string) => {
    setProvider(nextId);
    const next = providerOptions.find((s) => s.provider === nextId);
    if (next) setModel(next.defaultModel);
    setFormError("");
  };

  const submit = async () => {
    setBusy(true);
    setFormError("");
    try {
      const payload: HirePayload = {
        name: name.trim(),
        position,
        jobBoundary: jobBoundary.trim(),
        provider,
        model:
          provider === "mock"
            ? "mock"
            : model.trim() ||
              providerOptions.find((p) => p.provider === provider)?.defaultModel ||
              "mock",
      };
      if (editingId) {
        await onUpdate(editingId, payload);
      } else {
        await onHire(payload);
      }
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn’t save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const form = (title: string) => (
    <form
      className="mb-4 space-y-2 rounded-lg border border-zinc-800 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-400">{title}</p>
        <button type="button" onClick={resetForm} className="text-zinc-500 hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>
      <input
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <select
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        value={position}
        onChange={(e) => handlePositionChange(e.target.value as PositionKey)}
      >
        {Object.entries(POSITIONS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <textarea
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        rows={3}
        placeholder="What this person should focus on"
        value={jobBoundary}
        onChange={(e) => setJobBoundary(e.target.value)}
      />
      <div className="space-y-1">
        <p className="text-[11px] font-medium text-zinc-500">AI brain</p>
        <select
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value)}
        >
          {providerOptions.map((s) => (
            <option key={s.provider} value={s.provider}>
              {s.label}
              {s.provider !== "mock" && (s.ready ? " ✓" : " (no key)")}
            </option>
          ))}
        </select>
        {provider !== "mock" && (
          <input
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            placeholder="Model id (e.g. openai/gpt-4o-mini)"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            required
          />
        )}
        {selectedNeedsKey && (
          <p className="text-[11px] leading-snug text-amber-400/90">
            No key saved for this provider yet. Add it under Your API keys before Start, or
            Start will ask for it.
          </p>
        )}
        <p className="text-[11px] leading-snug text-zinc-600">
          Keys stay workspace-wide under Your API keys. Mock seats inherit the default brain
          on Start; teammates with a set brain keep it.
        </p>
      </div>
      {formError ? (
        <p className="rounded-md border border-red-900/60 bg-red-950/40 px-2 py-1.5 text-xs text-red-300">
          {formError}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Saving…" : editingId ? "Save changes" : "Add to team"}
      </Button>
    </form>
  );

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader>
          <PanelTitle className="flex items-center gap-2">
            <Users size={14} />
            Team templates
          </PanelTitle>
        </PanelHeader>
        <PanelContent className="space-y-2">
          <p className="text-xs text-zinc-500">
            Pick a starting team. You can add, edit, or remove people after. Each seat can use a
            different AI provider and model.
          </p>
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={async () => {
                setLoading(t.id);
                setFormError("");
                try {
                  await onApplyTemplate(t.id);
                  resetForm();
                } catch (err) {
                  setFormError(
                    err instanceof Error ? err.message : "Couldn’t apply that template.",
                  );
                } finally {
                  setLoading(null);
                }
              }}
              disabled={loading === t.id || busy}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-left hover:border-indigo-500/50 disabled:opacity-60"
            >
              <p className="text-sm font-medium text-zinc-200">
                {loading === t.id ? "Applying…" : t.name}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">{t.description}</p>
            </button>
          ))}
          {formError && !hiring && !editingId ? (
            <p className="rounded-md border border-red-900/60 bg-red-950/40 px-2 py-1.5 text-xs text-red-300">
              {formError}
            </p>
          ) : null}
        </PanelContent>
      </Panel>

      <Panel>
        <PanelHeader className="flex items-center justify-between">
          <PanelTitle>Your team ({agents.length})</PanelTitle>
          <Button variant="ghost" className="!px-2 !py-1" onClick={startHire}>
            <Plus size={14} />
            Add
          </Button>
        </PanelHeader>
        <PanelContent>
          {hiring && form("New teammate")}
          {editingId && form("Edit teammate")}

          <div className="space-y-3">
            {Object.entries(byPosition).map(([pos, members]) => (
              <div key={pos}>
                <p className="mb-1 text-xs font-medium text-zinc-500">
                  {members[0]?.positionLabel} ({members.length})
                </p>
                <ul className="space-y-1">
                  {members.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-2 rounded-lg bg-zinc-900/60 px-2 py-1.5 text-sm"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: a.avatarColor }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-zinc-200">{a.name}</span>
                        <span className="block truncate text-[11px] text-zinc-500">
                          {brainLabel(a.provider, a.model)}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
                        title="Edit"
                        onClick={() => startEdit(a)}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                        title="Remove"
                        onClick={async () => {
                          if (!confirm(`Remove ${a.name} from the team?`)) return;
                          setBusy(true);
                          setFormError("");
                          try {
                            await onRemove(a.id);
                            if (editingId === a.id) resetForm();
                          } catch (err) {
                            setFormError(
                              err instanceof Error
                                ? err.message
                                : "Couldn’t remove that teammate.",
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {agents.length === 0 && (
              <p className="text-xs text-zinc-600">
                No one on the team yet. Add someone or pick a template.
              </p>
            )}
          </div>
        </PanelContent>
      </Panel>
    </div>
  );
}
