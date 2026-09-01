"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Plus, Users } from "lucide-react";
import type { PositionKey } from "@/lib/constants";
import { POSITIONS } from "@/lib/constants";

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

type OrgBuilderProps = {
  agents: Agent[];
  templates: Template[];
  onApplyTemplate: (templateId: string) => Promise<void>;
  onHire: (data: {
    name: string;
    position: PositionKey;
    jobBoundary: string;
  }) => Promise<void>;
};

export function OrgBuilder({
  agents,
  templates,
  onApplyTemplate,
  onHire,
}: OrgBuilderProps) {
  const [hiring, setHiring] = useState(false);
  const [name, setName] = useState("");
  const [position, setPosition] = useState<PositionKey>("frontend_engineer");
  const [loading, setLoading] = useState<string | null>(null);

  const byPosition = agents.reduce<Record<string, Agent[]>>((acc, a) => {
    (acc[a.position] ??= []).push(a);
    return acc;
  }, {});

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
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={async () => {
                setLoading(t.id);
                await onApplyTemplate(t.id);
                setLoading(null);
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
          <Button variant="ghost" className="!px-2 !py-1" onClick={() => setHiring(!hiring)}>
            <Plus size={14} />
            Hire
          </Button>
        </PanelHeader>
        <PanelContent>
          {hiring && (
            <form
              className="mb-4 space-y-2 rounded-lg border border-zinc-800 p-3"
              onSubmit={async (e) => {
                e.preventDefault();
                await onHire({
                  name,
                  position,
                  jobBoundary: `Work as ${POSITIONS[position]}. Stay in role.`,
                });
                setName("");
                setHiring(false);
              }}
            >
              <input
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                placeholder="Agent name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <select
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                value={position}
                onChange={(e) => setPosition(e.target.value as PositionKey)}
              >
                {Object.entries(POSITIONS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <Button type="submit" className="w-full">
                Add to team
              </Button>
            </form>
          )}

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
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: a.avatarColor }}
                      />
                      <span className="text-zinc-200">{a.name}</span>
                      {a.department && (
                        <span className="ml-auto text-xs text-zinc-600">{a.department.name}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </PanelContent>
      </Panel>
    </div>
  );
}
