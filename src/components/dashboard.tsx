"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OfficeFloor } from "@/components/office/office-floor";
import { InspectorDrawer } from "@/components/office/inspector-drawer";
import { OrgBuilder } from "@/components/org/org-builder";
import { ArtifactsPanel } from "@/components/artifacts/artifacts-panel";
import { CredentialsForm } from "@/components/settings/credentials-form";
import { RunSettings } from "@/components/settings/run-settings";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { PRODUCT_NAME } from "@/lib/constants";
import { TEAM_TEMPLATES } from "@/lib/templates";
import { EVENT_LABELS, isMilestoneEvent } from "@/lib/events";
import type { RunEventMessage } from "@/lib/events";
import type { OfficeAgent } from "@/lib/office";
import type { AgentStatus } from "@prisma/client";
import { Play, Square, Sparkles } from "lucide-react";
import { PlanReview } from "@/components/plan/plan-review";

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
  const [runProvider, setRunProvider] = useState("openrouter");
  const [runModel, setRunModel] = useState("openai/gpt-4o-mini");
  const [runError, setRunError] = useState("");
  const [awaitingPlan, setAwaitingPlan] = useState(false);
  const [runOutcome, setRunOutcome] = useState<"idle" | "running" | "paused" | "completed" | "failed">(
    "idle",
  );
  const eventSourceRef = useRef<EventSource | null>(null);
  const seenEventIdsRef = useRef(new Set<string>());

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

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const selectedAgent = data?.agents.find((a) => a.id === selectedAgentId) ?? null;

  const handleSelectAgent = (id: string) => {
    setSelectedAgentId(id);
    setInspectorOpen(true);
  };

  const subscribeToRun = (id: string) => {
    eventSourceRef.current?.close();
    const es = new EventSource(`/api/runs/${id}/events`);
    eventSourceRef.current = es;
    es.onmessage = (msg) => {
      const event = JSON.parse(msg.data);
      if (event.type === "STREAM_END") {
        es.close();
        if (eventSourceRef.current === es) eventSourceRef.current = null;
        setRunning(false);
        if (event.runStatus === "paused") {
          setAwaitingPlan(true);
          setRunOutcome("paused");
        } else if (event.runStatus === "completed") {
          setRunOutcome("completed");
        } else if (event.runStatus === "failed" || event.runStatus === "cancelled") {
          setRunOutcome("failed");
        }
        refreshRun(id);
        void load();
        return;
      }
      if (event.id && seenEventIdsRef.current.has(event.id)) return;
      if (event.id) seenEventIdsRef.current.add(event.id);
      setEvents((prev) => [...prev, event]);
      if (event.payload?.message?.startsWith("Hired ")) {
        void load();
      }
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
          void refreshRun(id);
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
      if (eventSourceRef.current === es) eventSourceRef.current = null;
      setRunning(false);
    };
  };

  const refreshRun = async (id: string) => {
    const res = await fetch(`/api/runs/${id}`);
    const run = await res.json();
    setArtifacts(run.artifacts ?? []);
    setRunStats({ totalTokens: run.totalTokens ?? 0, estCostUsd: run.estCostUsd ?? 0 });
    if (run.status === "completed") setRunOutcome("completed");
    if (run.status === "paused") {
      setAwaitingPlan(true);
      setRunOutcome("paused");
    }
  };

  useEffect(() => {
    void fetch("/api/runs")
      .then((r) => r.json())
      .then(
        (
          runs: Array<{
            id: string;
            status: string;
            artifacts?: Array<{ id: string; type: string; title: string; content: string; createdAt: string }>;
            totalTokens?: number;
            estCostUsd?: number;
          }>,
        ) => {
          const latest = Array.isArray(runs) ? runs[0] : null;
          if (!latest) return;
          setRunId(latest.id);
          setArtifacts(latest.artifacts ?? []);
          setRunStats({
            totalTokens: latest.totalTokens ?? 0,
            estCostUsd: latest.estCostUsd ?? 0,
          });
          if (latest.status === "paused") {
            setAwaitingPlan(true);
            setRunOutcome("paused");
          } else if (latest.status === "completed") {
            setRunOutcome("completed");
          } else if (latest.status === "running" || latest.status === "pending") {
            setRunning(true);
            setRunOutcome("running");
            subscribeToRun(latest.id);
          }
        },
      )
      .catch(() => undefined);
  }, []);

  const startRun = async () => {
    if (!data) return;
    setRunning(true);
    setAwaitingPlan(false);
    setRunOutcome("running");
    setRunError("");
    setEvents([]);
    setStreamByAgent({});
    seenEventIdsRef.current.clear();
    await fetch(`/api/workspace/${data.workspace.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_goal", ceoGoal }),
    });
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: data.workspace.id,
        ceoGoal,
        provider: runProvider,
        model: runModel,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setRunError(json.error ?? "Run failed to start");
      setRunning(false);
      return;
    }
    setRunId(json.runId);
    subscribeToRun(json.runId);
    await load();
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
            onUpdate={async (id, hireData) => {
              await fetch(`/api/agents/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(hireData),
              });
              await load();
            }}
            onRemove={async (id) => {
              await fetch(`/api/agents/${id}`, { method: "DELETE" });
              if (selectedAgentId === id) {
                setSelectedAgentId(null);
                setInspectorOpen(false);
              }
              await load();
            }}
          />
          <CredentialsForm
            workspaceId={data.workspace.id}
            onSave={async (cred) => {
              await fetch("/api/credentials", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workspaceId: data.workspace.id, ...cred }),
              });
            }}
          />
          <RunSettings
            workspaceId={data.workspace.id}
            provider={runProvider}
            model={runModel}
            onProviderChange={setRunProvider}
            onModelChange={setRunModel}
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
                placeholder="What should we build? The workspace AI will staff a team and they’ll brainstorm."
              />
            </PanelContent>
          </Panel>

          {runError && (
            <p className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
              {runError}
            </p>
          )}

          {runOutcome === "failed" && (
            <p className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
              The run stopped with an error. Check the timeline and inspector. You can Run team again.
            </p>
          )}

          {runOutcome === "completed" && (
            <p className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-200">
              The team finished. They drafted a plan and file sketches — they did not deploy a live
              budget tracker. Open <span className="font-medium">Artifacts</span> on the right (click a
              card to read it, or Export zip). Avery’s job ended at the plan; engineers ran after that.
            </p>
          )}

          {awaitingPlan && runId && (
            <PlanReview
              runId={runId}
              onPublished={() => {
                setAwaitingPlan(false);
                setRunning(true);
                setRunOutcome("running");
                subscribeToRun(runId);
              }}
            />
          )}

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
                  {events
                    .filter((e, i, all) => e.id && all.findIndex((x) => x.id === e.id) === i)
                    .filter((e) => isMilestoneEvent(e.type))
                    .slice(-10)
                    .map((e) => (
                    <li key={e.id} className="text-zinc-400">
                      <span className="text-indigo-400">{EVENT_LABELS[e.type] ?? e.type}</span>
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
            runFinished={runOutcome === "completed"}
          />
        </aside>
      </main>

      <InspectorDrawer
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        agent={
          selectedAgent
            ? {
                ...selectedAgent,
                status: agentStatuses[selectedAgent.id] ?? selectedAgent.status,
              }
            : null
        }
        events={events}
        streamText={selectedAgentId ? streamByAgent[selectedAgentId] : undefined}
      />
    </div>
  );
}
