"use client";

import { useCallback, useEffect, useState } from "react";
import { OfficeFloor } from "@/components/office/office-floor";
import { InspectorDrawer } from "@/components/office/inspector-drawer";
import { OrgBuilder } from "@/components/org/org-builder";
import { ArtifactsPanel } from "@/components/artifacts/artifacts-panel";
import { CredentialsForm } from "@/components/settings/credentials-form";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { PRODUCT_NAME } from "@/lib/constants";
import { TEAM_TEMPLATES } from "@/lib/templates";
import type { RunEventMessage } from "@/lib/events";
import type { OfficeAgent } from "@/lib/office";
import type { AgentStatus } from "@prisma/client";
import { Play, Square, Sparkles } from "lucide-react";

type WorkspaceData = {
  workspace: { id: string; name: string; ceoGoal: string | null };
  agents: OfficeAgent[];
  desks: Array<{ id: string; label: string; x: number; y: number; room: string }>;
};

export function Dashboard() {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [ceoGoal, setCeoGoal] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [events, setEvents] = useState<RunEventMessage[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>({});
  const [streamByAgent, setStreamByAgent] = useState<Record<string, string>>({});
  const [runId, setRunId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<Array<{ id: string; type: string; title: string; content: string; createdAt: string }>>([]);
  const [runStats, setRunStats] = useState({ totalTokens: 0, estCostUsd: 0 });
  const [running, setRunning] = useState(false);
  const [simulating, setSimulating] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/workspace");
    const json = await res.json();
    setData(json);
    setCeoGoal(json.workspace.ceoGoal ?? "");
    const statuses: Record<string, AgentStatus> = {};
    for (const a of json.agents) statuses[a.id] = a.status;
    setAgentStatuses(statuses);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedAgent = data?.agents.find((a) => a.id === selectedAgentId) ?? null;

  const handleSelectAgent = (id: string) => {
    setSelectedAgentId(id);
    setInspectorOpen(true);
  };

  const subscribeToRun = (id: string) => {
    const es = new EventSource(`/api/runs/${id}/events`);
    es.onmessage = (msg) => {
      const event = JSON.parse(msg.data);
      if (event.type === "STREAM_END") {
        es.close();
        setRunning(false);
        refreshRun(id);
        return;
      }
      setEvents((prev) => [...prev, event]);
      const agentId = event.agentId ?? event.payload?.agentId;
      if (agentId) {
        if (event.type === "TASK_STARTED" || event.type === "AGENT_THINKING") {
          setAgentStatuses((s) => ({ ...s, [agentId]: "working" }));
        }
        if (event.type === "AGENT_HANDOFF") {
          setAgentStatuses((s) => ({ ...s, [agentId]: "handoff" }));
        }
        if (event.type === "AGENT_BLOCKED" || event.type === "AGENT_ERROR") {
          setAgentStatuses((s) => ({ ...s, [agentId]: "blocked" }));
        }
        if (event.type === "AGENT_TASK_DONE") {
          setAgentStatuses((s) => ({ ...s, [agentId]: "idle" }));
        }
        if (event.type === "AGENT_THINKING" && event.payload?.message) {
          setStreamByAgent((s) => ({
            ...s,
            [agentId]: (s[agentId] ?? "") + event.payload.message,
          }));
        }
      }
    };
    es.onerror = () => {
      es.close();
      setRunning(false);
    };
  };

  const refreshRun = async (id: string) => {
    const res = await fetch(`/api/runs/${id}`);
    const run = await res.json();
    setArtifacts(run.artifacts ?? []);
    setRunStats({ totalTokens: run.totalTokens ?? 0, estCostUsd: run.estCostUsd ?? 0 });
  };

  const startRun = async () => {
    if (!data) return;
    setRunning(true);
    setEvents([]);
    setStreamByAgent({});
    await fetch(`/api/workspace/${data.workspace.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_goal", ceoGoal }),
    });
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: data.workspace.id, ceoGoal }),
    });
    const { runId: id } = await res.json();
    setRunId(id);
    subscribeToRun(id);
  };

  const simulateRun = async () => {
    if (!data) return;
    setSimulating(true);
    setEvents([]);
    setStreamByAgent({});
    const res = await fetch("/api/simulate", { method: "POST" });
    const { events: simEvents } = await res.json();
    const feAgents = data.agents.filter((a) => a.position === "frontend_engineer");
    const idMap: Record<string, string> = {
      "fe-1": feAgents[0]?.id ?? "",
      "fe-2": feAgents[1]?.id ?? "",
    };

    for (const [i, e] of simEvents.entries()) {
      await new Promise((r) => setTimeout(r, 600));
      const mappedId = e.agentId ? idMap[e.agentId] ?? e.agentId : undefined;
      const event: RunEventMessage = {
        ...e,
        id: `sim-${i}`,
        createdAt: new Date().toISOString(),
        agentId: mappedId,
        payload: { ...e.payload, agentId: mappedId ?? e.payload.agentId },
      };
      setEvents((prev) => [...prev, event]);
      const aid = mappedId ?? e.payload?.agentId;
      if (aid) {
        if (["TASK_STARTED", "AGENT_THINKING"].includes(e.type)) {
          setAgentStatuses((s) => ({ ...s, [aid]: "working" }));
        }
        if (e.type === "AGENT_HANDOFF") setAgentStatuses((s) => ({ ...s, [aid]: "handoff" }));
        if (e.type === "AGENT_TASK_DONE") setAgentStatuses((s) => ({ ...s, [aid]: "idle" }));
        if (e.type === "AGENT_THINKING") {
          setStreamByAgent((s) => ({
            ...s,
            [aid]: (s[aid] ?? "") + (e.payload.message ?? ""),
          }));
        }
      }
    }
    setSimulating(false);
  };

  const cancelRun = async () => {
    if (!runId) return;
    await fetch(`/api/runs/${runId}`, { method: "DELETE" });
    setRunning(false);
  };

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading {PRODUCT_NAME}…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{PRODUCT_NAME}</h1>
            <p className="text-xs text-zinc-500">{data.workspace.name}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={simulateRun} disabled={simulating || running}>
              <Sparkles size={14} />
              {simulating ? "Simulating…" : "Simulate"}
            </Button>
            {running ? (
              <Button variant="danger" onClick={cancelRun}>
                <Square size={14} />
                Cancel
              </Button>
            ) : (
              <Button onClick={startRun} disabled={running}>
                <Play size={14} />
                Run team
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 p-6 lg:grid-cols-[280px_1fr_280px]">
        <aside className="space-y-4">
          <OrgBuilder
            agents={data.agents}
            templates={TEAM_TEMPLATES}
            onApplyTemplate={async (templateId) => {
              await fetch(`/api/workspace/${data.workspace.id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "apply_template", templateId }),
              });
              await load();
            }}
            onHire={async (hireData) => {
              await fetch(`/api/workspace/${data.workspace.id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "hire", ...hireData }),
              });
              await load();
            }}
          />
          <CredentialsForm
            onSave={async (cred) => {
              await fetch("/api/credentials", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workspaceId: data.workspace.id, ...cred }),
              });
            }}
          />
        </aside>

        <section className="space-y-4">
          <Panel>
            <PanelHeader>
              <PanelTitle>CEO goal</PanelTitle>
            </PanelHeader>
            <PanelContent>
              <textarea
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                rows={3}
                value={ceoGoal}
                onChange={(e) => setCeoGoal(e.target.value)}
                placeholder="What should your company build?"
              />
            </PanelContent>
          </Panel>

          <OfficeFloor
            agents={data.agents}
            desks={data.desks}
            selectedAgentId={selectedAgentId}
            onSelectAgent={handleSelectAgent}
            agentStatuses={agentStatuses}
          />

          {events.length > 0 && (
            <Panel>
              <PanelHeader>
                <PanelTitle>Run timeline</PanelTitle>
              </PanelHeader>
              <PanelContent>
                <ul className="max-h-32 space-y-1 overflow-auto text-xs">
                  {events.slice(-10).map((e) => (
                    <li key={e.id} className="text-zinc-400">
                      <span className="text-indigo-400">{e.type}</span>
                      {e.payload.agentName && ` — ${e.payload.agentName}`}
                      {e.payload.taskTitle && `: ${e.payload.taskTitle}`}
                    </li>
                  ))}
                </ul>
              </PanelContent>
            </Panel>
          )}
        </section>

        <aside>
          <ArtifactsPanel
            artifacts={artifacts}
            totalTokens={runStats.totalTokens}
            estCostUsd={runStats.estCostUsd}
            runId={runId ?? undefined}
          />
        </aside>
      </main>

      <InspectorDrawer
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        agent={selectedAgent}
        events={events}
        streamText={selectedAgentId ? streamByAgent[selectedAgentId] : undefined}
      />
    </div>
  );
}
