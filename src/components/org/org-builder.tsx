"use client";

import { useState } from "react";
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
  department?: { name: string } | null;
};

type Template = { id: string; name: string; description: string };

type HirePayload = {
  name: string;
  position: PositionKey;
  jobBoundary: string;
};

type OrgBuilderProps = {
  agents: Agent[];
  templates: Template[];
  onApplyTemplate: (templateId: string) => Promise<void>;
  onHire: (data: HirePayload) => Promise<void>;
  onUpdate: (id: string, data: HirePayload) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
};

export function OrgBuilder({
  agents,
  templates,
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
  const [loading, setLoading] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
  };

  const startEdit = (agent: Agent) => {
    setHiring(false);
    setEditingId(agent.id);
    setName(agent.name);
    setPosition(agent.position as PositionKey);
    setJobBoundary(agent.jobBoundary);
  };

  const handlePositionChange = (next: PositionKey) => {
    setPosition(next);
    if (!editingId) {
      setJobBoundary(DEFAULT_JOB_BOUNDARIES[next]);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      const payload = { name: name.trim(), position, jobBoundary: jobBoundary.trim() };
      if (editingId) {
        await onUpdate(editingId, payload);
      } else {
        await onHire(payload);
      }
      resetForm();
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
        placeholder="Focus for this person — they still help realize the CEO goal"
        value={jobBoundary}
        onChange={(e) => setJobBoundary(e.target.value)}
      />
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
            Templates replace the current roster. After that you can hire, edit, or fire anyone.
          </p>
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={async () => {
                setLoading(t.id);
                await onApplyTemplate(t.id);
                setLoading(null);
                resetForm();
              }}
              disabled={loading === t.id}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-left hover:border-indigo-500/50"
            >
              <p className="text-sm font-medium text-zinc-200">{t.name}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{t.description}</p>
            </button>
          ))}
        </PanelContent>
      </Panel>

      <Panel>
        <PanelHeader className="flex items-center justify-between">
          <PanelTitle>Your team ({agents.length})</PanelTitle>
          <Button
            variant="ghost"
            className="!px-2 !py-1"
            onClick={() => {
              setEditingId(null);
              setHiring(!hiring);
              setName("");
              setPosition("frontend_engineer");
              setJobBoundary(DEFAULT_JOB_BOUNDARIES.frontend_engineer);
            }}
          >
            <Plus size={14} />
            Hire
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
                      <span className="min-w-0 flex-1 truncate text-zinc-200">{a.name}</span>
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
                          await onRemove(a.id);
                          if (editingId === a.id) resetForm();
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
              <p className="text-xs text-zinc-600">No one on the floor yet. Hire someone or apply a template.</p>
            )}
          </div>
        </PanelContent>
      </Panel>
    </div>
  );
}
