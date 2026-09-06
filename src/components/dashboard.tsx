"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OfficeViewport } from "@/components/office/office-viewport";
import { InspectorDrawer } from "@/components/office/inspector-drawer";
import { ArtifactsPanel } from "@/components/artifacts/artifacts-panel";
import { RunDeliverableActions } from "@/components/artifacts/run-deliverable-actions";
import {
  DeliverableActionSheet,
  type DeliverableActionMode,
} from "@/components/artifacts/deliverable-action-sheet";
import {
  ConversationList,
  getStoredActiveRunId,
  setStoredActiveRunId,
  type ConversationSummary,
} from "@/components/conversations/conversation-list";
import { AppHeader } from "@/components/layout/app-header";
import { SettingsDrawer } from "@/components/layout/settings-drawer";
import { GoalComposer } from "@/components/layout/goal-composer";
import { RunReadinessChecklist } from "@/components/layout/run-readiness-checklist";
import {
  WelcomePanel,
  WELCOME_TIPS_DISMISS_KEY,
} from "@/components/layout/welcome-panel";
import { DashboardSkeleton } from "@/components/layout/dashboard-skeleton";
import { ActivityFeed } from "@/components/office/activity-feed";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SHOW_DEV_TOOLS } from "@/lib/dev-tools";
import type { RunEventMessage } from "@/lib/events";
import type { OfficeAgent } from "@/lib/office";
import type { AgentStatus } from "@prisma/client";
import { PlanReview } from "@/components/plan/plan-review";
import { OFFICE_VIEW_KEY, type OfficeViewMode } from "@/components/office/office-layout";
import { PLAN_PUBLISHED_TITLE } from "@/lib/workflow";
import { streamsFromEvents, type ThoughtTask } from "@/lib/thought-process";
import { OfficeEditorHud } from "@/components/office/office-editor-hud";
import {
  applyBlueprintEdit,
  cloneBlueprint,
  cyclePlacementYaw,
  eraseWallByKey,
  hqBlueprint,
  type EditorTool,
  type OfficeBlueprint,
  type OfficeLayoutSummary,
  type TileEdge,
} from "@/lib/office-blueprint";

/** Strip nested follow-up suffixes so Request changes stays on the original brief. */
function baseGoalFromRunGoal(goal: string): string {
  const marker = "\n\nChanges I want:\n";
  const idx = goal.indexOf(marker);
  if (idx === -1) return goal.trim();
  return goal.slice(0, idx).trim();
}

type WorkspaceData = {
  workspace: { id: string; name: string; ceoGoal: string | null };
  agents: OfficeAgent[];
  desks: Array<{ id: string; label: string; x: number; y: number; room: string }>;
  officeLayouts?: OfficeLayoutSummary[];
  officeLayout?: { id: string; name: string; isActive: boolean; data: OfficeBlueprint };
  user?: { email: string; name: string | null };
  usage?: {
    used: number;
    limit: number;
    plan: string;
    canRun: boolean;
    reason: string | null;
  };
};

type RunDetail = {
  id: string;
  ceoGoal: string;
  status: string;
  totalTokens?: number;
  estCostUsd?: number;
  artifacts?: Array<{
    id: string;
    type: string;
    title: string;
    content: string;
    createdAt: string;
    filePath?: string | null;
  }>;
  tasks?: ThoughtTask[];
  events?: Array<{
    id: string;
    type: RunEventMessage["type"];
    payload: RunEventMessage["payload"];
    agentId?: string | null;
    createdAt: string;
  }>;
};

export function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [ceoGoal, setCeoGoal] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [credentialsRevision, setCredentialsRevision] = useState(0);
  const [runReady, setRunReady] = useState(true);
  const [runReadyReason, setRunReadyReason] = useState<string | null>(null);
  const [newChatDialogOpen, setNewChatDialogOpen] = useState(false);
  const [showWelcomeTips, setShowWelcomeTips] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(WELCOME_TIPS_DISMISS_KEY) !== "1";
    } catch {
      return true;
    }
  });
  const [conversationsReady, setConversationsReady] = useState(false);
  const [deliverableAction, setDeliverableAction] = useState<DeliverableActionMode | null>(
    null,
  );
  const [deliverableSheetBusy, setDeliverableSheetBusy] = useState(false);
  const [deliverableSheetError, setDeliverableSheetError] = useState("");
  const planPanelRef = useRef<HTMLDivElement>(null);
  const [mobilePane, setMobilePane] = useState<"chats" | "work" | "files">("work");
  const [events, setEvents] = useState<RunEventMessage[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>({});
  const [streamByAgent, setStreamByAgent] = useState<Record<string, string>>({});
  const [runId, setRunId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<
    Array<{
      id: string;
      type: string;
      title: string;
      content: string;
      createdAt: string;
      filePath?: string | null;
    }>
  >([]);
  const [tasks, setTasks] = useState<ThoughtTask[]>([]);
  const [runStats, setRunStats] = useState({ totalTokens: 0, estCostUsd: 0 });
  const [running, setRunning] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [runProvider, setRunProvider] = useState("mock");
  const [runModel, setRunModel] = useState("mock");
  const [runError, setRunError] = useState("");
  const [awaitingPlan, setAwaitingPlan] = useState(false);
  const [runOutcome, setRunOutcome] = useState<
    "idle" | "running" | "paused" | "completed" | "failed"
  >("idle");
  const [officeView, setOfficeView] = useState<OfficeViewMode>("3d");
  const [editingOffice, setEditingOffice] = useState(false);
  const [officeDraft, setOfficeDraft] = useState<OfficeBlueprint | null>(null);
  const [officeTool, setOfficeTool] = useState<EditorTool>("desk");
  const [officeColor, setOfficeColor] = useState("#b45309");
  const [officeYaw, setOfficeYaw] = useState(0);
  const [officeDirty, setOfficeDirty] = useState(false);
  const [officeBusy, setOfficeBusy] = useState(false);
  const [layoutName, setLayoutName] = useState("HQ");
  const editingOfficeRef = useRef(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const seenEventIdsRef = useRef(new Set<string>());
  const subscribeToRunRef = useRef<(id: string) => void>(() => undefined);
  const floorBusyRef = useRef(false);
  const hydratedLlmRef = useRef(false);

  // Exit arrange mode when plan review opens (adjust during render — not in an effect).
  if (awaitingPlan && editingOffice) {
    setEditingOffice(false);
  }

  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/runs");
    if (!res.ok) return [];
    const runs = (await res.json()) as ConversationSummary[];
    setConversations(runs);
    return runs;
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/workspace");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const json = await res.json();
    setData(json);
    if (!hydratedLlmRef.current && json.agents?.[0]) {
      hydratedLlmRef.current = true;
      setRunProvider(json.agents[0].provider ?? "mock");
      setRunModel(json.agents[0].model ?? "mock");
    }
    if (!editingOfficeRef.current && json.officeLayout) {
      setOfficeDraft(cloneBlueprint(json.officeLayout.data));
      setLayoutName(json.officeLayout.name);
      setOfficeDirty(false);
    }
    const statuses: Record<string, AgentStatus> = {};
    for (const a of json.agents as OfficeAgent[]) statuses[a.id] = a.status;
    if (!floorBusyRef.current) {
      setAgentStatuses(statuses);
    } else {
      setAgentStatuses((prev) => {
        const next = { ...prev };
        for (const a of json.agents as OfficeAgent[]) {
          if (!(a.id in next)) next[a.id] = a.status;
        }
        return next;
      });
    }
    return json as WorkspaceData;
  }, [router]);

  const saveOfficeLayout = useCallback(async () => {
    if (!data?.officeLayout || !officeDraft) return;
    setOfficeBusy(true);
    try {
      await fetch(`/api/workspace/layouts/${data.officeLayout.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", name: layoutName, data: officeDraft }),
      });
      setOfficeDirty(false);
      await load();
    } finally {
      setOfficeBusy(false);
    }
  }, [data?.officeLayout, officeDraft, layoutName, load]);

  const handleOfficeTile = useCallback((x: number, y: number, edge: TileEdge) => {
    setOfficeDraft((prev) =>
      applyBlueprintEdit(prev ?? hqBlueprint(), officeTool, officeColor, x, y, edge, officeYaw),
    );
    setOfficeDirty(true);
  }, [officeTool, officeColor, officeYaw]);

  const handleOfficeWall = useCallback((wallKey: string) => {
    if (officeTool !== "erase") return;
    setOfficeDraft((prev) => eraseWallByKey(prev ?? hqBlueprint(), wallKey));
    setOfficeDirty(true);
  }, [officeTool]);

  const rotateOfficePlacement = useCallback(() => {
    setOfficeYaw((yaw) => cyclePlacementYaw(yaw));
  }, []);

  const applyRunDetail = useCallback((run: RunDetail) => {
    setRunId(run.id);
    setStoredActiveRunId(run.id);
    setCeoGoal(run.ceoGoal);
    setArtifacts(run.artifacts ?? []);
    setTasks(
      (run.tasks ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description ?? null,
        status: t.status,
        position: t.position,
        output: t.output ?? null,
        claimedById: t.claimedById ?? null,
        completedAt: t.completedAt ?? null,
        createdAt: t.createdAt,
      })),
    );
    setRunStats({ totalTokens: run.totalTokens ?? 0, estCostUsd: run.estCostUsd ?? 0 });
    const mappedEvents = (run.events ?? []).map((e) => ({
      id: e.id,
      type: e.type,
      payload: e.payload,
      createdAt: e.createdAt,
      agentId: e.agentId,
    }));
    setEvents(mappedEvents);
    setStreamByAgent(streamsFromEvents(mappedEvents));
    seenEventIdsRef.current.clear();

    if (run.status === "paused") {
      setAwaitingPlan(true);
      setRunOutcome("paused");
      setRunning(false);
    } else if (run.status === "completed") {
      setAwaitingPlan(false);
      setRunOutcome("completed");
      setRunning(false);
    } else if (run.status === "failed" || run.status === "cancelled") {
      setAwaitingPlan(false);
      setRunOutcome("failed");
      setRunning(false);
    } else if (run.status === "running" || run.status === "pending") {
      setAwaitingPlan(false);
      setRunOutcome("running");
      setRunning(true);
      subscribeToRunRef.current(run.id);
    } else {
      setAwaitingPlan(false);
      setRunOutcome("idle");
      setRunning(false);
    }
  }, []);

  const selectRun = useCallback(
    async (id: string) => {
      eventSourceRef.current?.close();
      const res = await fetch(`/api/runs/${id}`);
      if (!res.ok) return;
      const run = (await res.json()) as RunDetail;
      setDeliverableAction(null);
      setDeliverableSheetBusy(false);
      setDeliverableSheetError("");
      applyRunDetail(run);
      setMobilePane("work");
    },
    [applyRunDetail],
  );

  const blankConversation = useCallback(() => {
    eventSourceRef.current?.close();
    setRunId(null);
    setStoredActiveRunId(null);
    setCeoGoal("");
    setDeliverableAction(null);
    setDeliverableSheetBusy(false);
    setDeliverableSheetError("");
    setArtifacts([]);
    setTasks([]);
    setRunStats({ totalTokens: 0, estCostUsd: 0 });
    setEvents([]);
    setStreamByAgent({});
    seenEventIdsRef.current.clear();
    setAwaitingPlan(false);
    setRunOutcome("idle");
    setRunning(false);
    setRunError("");
    floorBusyRef.current = false;
    setMobilePane("work");
  }, []);

  const closeDeliverableSheet = useCallback(() => {
    if (deliverableSheetBusy) return;
    setDeliverableAction(null);
    setDeliverableSheetError("");
  }, [deliverableSheetBusy]);

  const startFollowUpChat = useCallback(() => {
    if (running) {
      setNewChatDialogOpen(true);
      return;
    }
    setDeliverableSheetError("");
    setDeliverableAction("follow-up");
  }, [running]);

  const startRedesignChat = useCallback(() => {
    if (running) {
      setNewChatDialogOpen(true);
      return;
    }
    setDeliverableSheetError("");
    setDeliverableAction("redesign");
  }, [running]);
  useEffect(() => {
    void (async () => {
      await load();
      const runs = await loadConversations();
      setConversationsReady(true);
      const stored = getStoredActiveRunId();
      if (stored && runs.some((r) => r.id === stored)) {
        await selectRun(stored);
      } else {
        blankConversation();
      }
    })();
  }, [load, loadConversations, selectRun, blankConversation]);

  useEffect(() => {
    if (!awaitingPlan || !runId) return;
    const panel = planPanelRef.current;
    if (!panel) return;
    const focusable = panel.querySelector<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
  }, [awaitingPlan, runId]);

  useEffect(() => {
    const saved = window.localStorage.getItem(OFFICE_VIEW_KEY);
    if (saved !== "iso" && saved !== "3d") return;
    const frame = window.requestAnimationFrame(() => setOfficeView(saved));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    floorBusyRef.current = running || simulating || awaitingPlan;
  }, [running, simulating, awaitingPlan]);

  useEffect(() => {
    if (awaitingPlan) {
      editingOfficeRef.current = false;
    }
  }, [awaitingPlan]);

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

  const refreshRun = async (id: string) => {
    const res = await fetch(`/api/runs/${id}`);
    const run = await res.json();
    setArtifacts(run.artifacts ?? []);
    setTasks(
      (run.tasks ?? []).map((t: ThoughtTask & { createdAt?: string }) => ({
        id: t.id,
        title: t.title,
        description: t.description ?? null,
        status: t.status,
        position: t.position,
        output: t.output ?? null,
        claimedById: t.claimedById ?? null,
        completedAt: t.completedAt ?? null,
        createdAt: t.createdAt,
      })),
    );
    setRunStats({ totalTokens: run.totalTokens ?? 0, estCostUsd: run.estCostUsd ?? 0 });
    if (run.status === "completed") setRunOutcome("completed");
    if (run.status === "paused") {
      setAwaitingPlan(true);
      setRunOutcome("paused");
    }
    if (run.status === "failed" || run.status === "cancelled") {
      setAwaitingPlan(false);
      setRunOutcome("failed");
    }
  };

  const subscribeToRun = (id: string) => {
    eventSourceRef.current?.close();
    const es = new EventSource(`/api/runs/${id}/events`);
    eventSourceRef.current = es;
    es.onmessage = (msg) => {
      const event = JSON.parse(msg.data);
      if (event.type === "STREAM_END") {
        es.close();
        if (eventSourceRef.current !== es) return;
        eventSourceRef.current = null;
        setRunning(false);
        if (event.runStatus === "paused") {
          floorBusyRef.current = true;
          setAwaitingPlan(true);
          setRunOutcome("paused");
        } else if (event.runStatus === "completed") {
          floorBusyRef.current = false;
          setRunOutcome("completed");
        } else if (event.runStatus === "failed" || event.runStatus === "cancelled") {
          floorBusyRef.current = false;
          setRunOutcome("failed");
        } else {
          floorBusyRef.current = false;
        }
        void refreshRun(id);
        void load();
        void loadConversations();
        return;
      }
      if (event.id && seenEventIdsRef.current.has(event.id)) return;
      if (event.id) seenEventIdsRef.current.add(event.id);
      setEvents((prev) => [...prev, event]);
      if (event.payload?.message?.startsWith("Hired ")) {
        const hireId = event.agentId ?? event.payload?.agentId;
        if (typeof hireId === "string") {
          setAgentStatuses((s) => ({ ...s, [hireId]: "walking" }));
        }
        void load();
      }
      const agentId = event.agentId ?? event.payload?.agentId;
      if (agentId) {
        const hired = Boolean(event.payload?.message?.startsWith("Hired "));
        if (event.type === "TASK_CLAIMED" || hired) {
          setAgentStatuses((s) => ({ ...s, [agentId]: "walking" }));
        }
        if (
          !hired &&
          (event.type === "TASK_STARTED" ||
            event.type === "AGENT_THINKING" ||
            event.type === "EXECUTION_STARTED")
        ) {
          setAgentStatuses((s) => ({ ...s, [agentId]: "working" }));
        }
        if (event.type === "AGENT_HANDOFF") {
          setAgentStatuses((s) => ({ ...s, [agentId]: "handoff" }));
        }
        if (
          event.type === "AGENT_BLOCKED" ||
          event.type === "AGENT_ERROR" ||
          event.type === "TOOL_FAILED" ||
          event.type === "CHECK_FAILED"
        ) {
          setAgentStatuses((s) => ({ ...s, [agentId]: "blocked" }));
        }
        if (event.type === "AGENT_TASK_DONE" || event.type === "EXECUTION_COMPLETED") {
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
      if (eventSourceRef.current !== es) return;
      eventSourceRef.current = null;
      setRunning(false);
    };
  };

  useEffect(() => {
    subscribeToRunRef.current = subscribeToRun;
  });

  const requestNewChat = () => {
    if (running) {
      setNewChatDialogOpen(true);
      return;
    }
    blankConversation();
  };

  const handleRename = async (id: string, title: string) => {
    await fetch(`/api/runs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/runs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archive: true }),
    });
    setConversations((prev) => prev.filter((x) => x.id !== id));
    if (runId === id) blankConversation();
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const force3D = () => {
    setOfficeView("3d");
    window.localStorage.setItem(OFFICE_VIEW_KEY, "3d");
  };

  const beginCreatedRun = async (createdRunId: string, goalForRun: string) => {
    setCeoGoal(goalForRun);
    setDeliverableAction(null);
    setDeliverableSheetBusy(false);
    setDeliverableSheetError("");
    setRunId(createdRunId);
    setStoredActiveRunId(createdRunId);
    setMobilePane("work");
    floorBusyRef.current = true;
    force3D();
    setRunning(true);
    setAwaitingPlan(false);
    setRunOutcome("running");
    setRunError("");
    setEvents([]);
    setStreamByAgent({});
    seenEventIdsRef.current.clear();
    setArtifacts([]);
    setTasks([]);
    subscribeToRun(createdRunId);
    const runs = await loadConversations();
    const created = runs.find((r) => r.id === createdRunId);
    if (!created) {
      setConversations((prev) => [
        {
          id: createdRunId,
          title: goalForRun.slice(0, 60),
          ceoGoal: goalForRun,
          status: "pending",
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    }
    const fresh = await load();
    if (fresh?.agents) {
      setAgentStatuses((s) => {
        const next = { ...s };
        for (const a of fresh.agents) {
          if (!(a.id in next)) next[a.id] = a.status;
        }
        return next;
      });
    }
  };

  const startRun = async () => {
    if (!data) return;
    if (data.usage && !data.usage.canRun) {
      setRunError(
        data.usage.reason ??
          `Free beta limit reached (${data.usage.used}/${data.usage.limit} runs this month).`,
      );
      return;
    }
    if (!runReady) {
      setRunError(runReadyReason ?? "Finish the checklist before starting.");
      setSettingsOpen(true);
      return;
    }
    const goalForRun = ceoGoal.trim();
    if (!goalForRun) {
      setRunError("Enter what you want to build, then Start.");
      return;
    }
    floorBusyRef.current = true;
    force3D();
    setRunning(true);
    setAwaitingPlan(false);
    setRunOutcome("running");
    setRunError("");
    setEvents([]);
    setStreamByAgent({});
    seenEventIdsRef.current.clear();
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: data.workspace.id,
        ceoGoal: goalForRun,
        provider: runProvider,
        model: runModel,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      floorBusyRef.current = false;
      setRunError(json.error ?? "Couldn’t start. Check settings and try again.");
      setRunning(false);
      setRunOutcome("idle");
      void load();
      return;
    }
    await beginCreatedRun(json.runId as string, goalForRun);
  };

  const startFromDeliverableSheet = async (draftText: string) => {
    if (!data || !deliverableAction) return;
    if (data.usage && !data.usage.canRun) {
      setDeliverableSheetError(
        data.usage.reason ??
          `Free beta limit reached (${data.usage.used}/${data.usage.limit} runs this month).`,
      );
      return;
    }
    if (!runReady) {
      setDeliverableSheetError(runReadyReason ?? "Finish the checklist before starting.");
      setSettingsOpen(true);
      return;
    }
    const prior = baseGoalFromRunGoal(ceoGoal);
    const goalForRun =
      deliverableAction === "follow-up"
        ? `${prior}\n\nChanges I want:\n${draftText.trim()}`
        : draftText.trim();
    if (!draftText.trim()) {
      setDeliverableSheetError(
        deliverableAction === "follow-up"
          ? "Describe the changes you want, then Start."
          : "Enter what you want to build, then Start.",
      );
      return;
    }

    setDeliverableSheetBusy(true);
    setDeliverableSheetError("");
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: data.workspace.id,
        ceoGoal: goalForRun,
        provider: runProvider,
        model: runModel,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setDeliverableSheetBusy(false);
      setDeliverableSheetError(json.error ?? "Couldn’t start. Check settings and try again.");
      void load();
      return;
    }
    await beginCreatedRun(json.runId as string, goalForRun);
  };

  const simulateRun = async () => {
    if (!data) return;
    floorBusyRef.current = true;
    force3D();
    setSimulating(true);
    setEvents([]);
    setStreamByAgent({});
    const res = await fetch("/api/simulate", { method: "POST" });
    const { events: simEvents } = await res.json();
    const feAgents = data.agents.filter((a) => a.position === "frontend_engineer");
    const beAgents = data.agents.filter((a) => a.position === "backend_engineer");
    const idMap: Record<string, string> = {
      "fe-1": feAgents[0]?.id ?? "",
      "fe-2": feAgents[1]?.id ?? feAgents[0]?.id ?? "",
      "be-1": beAgents[0]?.id ?? "",
    };

    await new Promise((r) => setTimeout(r, 1600));

    for (const [i, e] of simEvents.entries()) {
      await new Promise((r) => setTimeout(r, 1100));
      const mappedId = e.agentId ? idMap[e.agentId] || e.agentId : undefined;
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
        const hired = Boolean(e.payload?.message?.startsWith("Hired "));
        if (e.type === "TASK_CLAIMED" || hired) {
          setAgentStatuses((s) => ({ ...s, [aid]: "walking" }));
        }
        if (!hired && ["TASK_STARTED", "AGENT_THINKING"].includes(e.type)) {
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
    await new Promise((r) => setTimeout(r, 4000));
    floorBusyRef.current = false;
    setSimulating(false);
  };

  const cancelRun = async () => {
    if (!runId) return;
    floorBusyRef.current = false;
    await fetch(`/api/runs/${runId}`, { method: "DELETE" });
    setRunning(false);
    setAwaitingPlan(false);
    setRunOutcome("failed");
    setAgentStatuses((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) next[id] = "idle";
      return next;
    });
    setConversations((prev) =>
      prev.map((c) => (c.id === runId ? { ...c, status: "cancelled" } : c)),
    );
    void loadConversations();
  };

  const resumeRun = async () => {
    if (!data || !runId) return;
    floorBusyRef.current = true;
    force3D();
    setRunning(true);
    setAwaitingPlan(false);
    setRunOutcome("running");
    setRunError("");
    setStreamByAgent({});
    setAgentStatuses((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) next[id] = "idle";
      return next;
    });
    const res = await fetch(`/api/runs/${runId}/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: runProvider,
        model: runModel,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      floorBusyRef.current = false;
      setRunError(json.error ?? "Couldn’t resume. Check settings and try again.");
      setRunning(false);
      setRunOutcome("failed");
      return;
    }
    subscribeToRun(runId);
    void loadConversations();
    const fresh = await load();
    if (fresh?.agents) {
      setAgentStatuses((s) => {
        const next = { ...s };
        for (const a of fresh.agents) {
          if (!(a.id in next)) next[a.id] = a.status;
        }
        return next;
      });
    }
  };

  if (!data) {
    return <DashboardSkeleton />;
  }

  const onShift = running || simulating || awaitingPlan;
  const inPlanning =
    awaitingPlan || (running && !artifacts.some((a) => a.title === PLAN_PUBLISHED_TITLE));
  const codingAgents = data.agents.filter((a) => agentStatuses[a.id] === "working");
  const qaWorking = codingAgents.filter((a) => a.position === "qa_engineer");
  const buildersWorking = codingAgents.filter((a) => a.position !== "qa_engineer");
  const headingToDesk = data.agents.filter(
    (a) => agentStatuses[a.id] === "walking" || agentStatuses[a.id] === "handoff",
  );
  const hiredAgentIds = new Set(
    events
      .filter((e) => e.payload?.message?.startsWith("Hired "))
      .map((e) => e.agentId ?? e.payload?.agentId)
      .filter((id): id is string => typeof id === "string"),
  );
  const builderNames = buildersWorking.map((a) => a.name.split(" ")[0]);
  const qaNames = qaWorking.map((a) => a.name.split(" ")[0]);
  let shiftBanner: string | null = null;
  if (inPlanning) {
    shiftBanner = awaitingPlan
      ? "Planning meeting — review and publish when ready"
      : "Planning meeting";
  } else if (qaWorking.length > 0 && buildersWorking.length === 0) {
    shiftBanner =
      qaWorking.length === 1
        ? `${qaNames[0]} is reviewing quality`
        : "QA is reviewing quality";
  } else if (buildersWorking.length === 1 && qaWorking.length === 0) {
    shiftBanner = `${builderNames[0]} is coding`;
  } else if (buildersWorking.length > 1 && qaWorking.length === 0) {
    shiftBanner = `${builderNames.slice(0, 2).join(" & ")}${
      builderNames.length > 2 ? " + crew" : ""
    } coding`;
  } else if (buildersWorking.length > 0 && qaWorking.length > 0) {
    shiftBanner = `${builderNames[0] ?? "Crew"} coding · QA reviewing`;
  } else if (headingToDesk.length === 1) {
    const walker = headingToDesk[0]!;
    const first = walker.name.split(" ")[0];
    shiftBanner = hiredAgentIds.has(walker.id)
      ? `${first} just walked in`
      : `${first} is heading to their desk`;
  } else if (headingToDesk.length > 1) {
    shiftBanner = headingToDesk.some((a) => hiredAgentIds.has(a.id))
      ? "New hires are walking in"
      : "People are heading to their desks";
  }

  const chatsAside = (
    <ConversationList
      conversations={conversations}
      activeId={runId}
      onNew={() => {
        requestNewChat();
        setMobilePane("work");
      }}
      onSelect={(id) => {
        void selectRun(id);
        setMobilePane("work");
      }}
      onRename={handleRename}
      onDelete={handleDelete}
    />
  );

  const filesAside = (
    <ArtifactsPanel
      artifacts={artifacts}
      totalTokens={runStats.totalTokens}
      estCostUsd={runStats.estCostUsd}
      runId={runId ?? undefined}
      runFinished={runOutcome === "completed"}
      ceoGoal={ceoGoal}
      tasks={tasks}
      events={events}
      agents={data.agents.map((a) => ({ id: a.id, name: a.name }))}
    />
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <AppHeader
        workspaceName={data.workspace.name}
        userEmail={data.user?.email}
        userName={data.user?.name}
        running={running}
        runOutcome={runOutcome}
        onCancel={cancelRun}
        onResume={() => void resumeRun()}
        onOpenSettings={() => setSettingsOpen(true)}
        onLogout={logout}
        onSimulate={SHOW_DEV_TOOLS ? simulateRun : undefined}
        simulating={simulating}
        onOpenChats={() => setMobilePane((p) => (p === "chats" ? "work" : "chats"))}
        onOpenFiles={
          runId ? () => setMobilePane((p) => (p === "files" ? "work" : "files")) : undefined
        }
        filesCount={artifacts.length}
        runUsage={
          data.usage
            ? {
                used: data.usage.used,
                limit: data.usage.limit,
                canRun: data.usage.canRun,
              }
            : null
        }
      />

      <div className="relative flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-950/90 lg:flex">
          {chatsAside}
        </aside>

        <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <OfficeViewport
            mode={officeView}
            agents={data.agents}
            desks={data.desks}
            selectedAgentId={selectedAgentId}
            onSelectAgent={handleSelectAgent}
            agentStatuses={agentStatuses}
            events={events}
            onShift={onShift}
            inPlanning={inPlanning}
            blueprint={officeDraft ?? data.officeLayout?.data}
            editor={
              editingOffice
                ? {
                    enabled: true,
                    tool: officeTool,
                    color: officeColor,
                    yaw: officeYaw,
                    onTile: handleOfficeTile,
                    onWall: handleOfficeWall,
                  }
                : undefined
            }
          />

          <div className="office-hud">
            {awaitingPlan && runId ? (
              <div className="pointer-events-auto relative z-10 flex h-full w-full flex-col items-center justify-center">
                <div
                  className="pointer-events-none absolute inset-0 bg-zinc-950/55 backdrop-blur-[2px]"
                  aria-hidden
                />
                <div
                  ref={planPanelRef}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="plan-review-title"
                  className="relative z-10 flex h-full max-h-[calc(100dvh-5.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-950/95 p-4 shadow-xl sm:max-h-[min(85vh,720px)] sm:h-auto"
                >
                  <PlanReview
                    runId={runId}
                    onPublished={() => {
                      setAwaitingPlan(false);
                      setRunning(true);
                      setRunOutcome("running");
                      subscribeToRun(runId);
                    }}
                    onRestart={startRedesignChat}
                  />
                </div>
              </div>
            ) : (
              <>
            <div>
            {shiftBanner && <p className="office-work-banner">{shiftBanner}</p>}
            <div className="flex items-start justify-between gap-3">
              <div className="pointer-events-auto max-w-sm space-y-2">
                {runId && ceoGoal && runOutcome !== "completed" && runOutcome !== "failed" && (
                  <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 px-3 py-2 backdrop-blur-md">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                      You asked
                    </p>
                    <p className="line-clamp-2 text-sm text-zinc-100">{ceoGoal}</p>
                  </div>
                )}
                {runError && <Alert variant="error">{runError}</Alert>}
                {runOutcome === "failed" && runId && !running && (
                  <Alert variant="error">
                    <p>The team stopped.</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="primary"
                        className="!h-8 !px-3"
                        onClick={() => void resumeRun()}
                      >
                        Resume
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="!h-8 !px-3"
                        onClick={startRedesignChat}
                      >
                        Restart
                      </Button>
                    </div>
                    <p className="mt-2 text-[11px] text-zinc-500">
                      Resume continues this chat. Restart opens a new brief.
                    </p>
                  </Alert>
                )}
                {runOutcome === "completed" && runId && (
                  <Alert
                    variant="success"
                    className="overflow-visible bg-emerald-950/95 ring-1 ring-emerald-800/50"
                  >
                    <p className="font-medium text-emerald-50">Your app is ready</p>
                    <RunDeliverableActions
                      runId={runId}
                      artifacts={artifacts}
                      ceoGoal={ceoGoal}
                      runFinished
                      variant="hud"
                      onRequestChanges={startFollowUpChat}
                      onRestart={startRedesignChat}
                    />
                  </Alert>
                )}
                {runOutcome !== "completed" && <ActivityFeed events={events} />}
              </div>

              <div className="pointer-events-auto flex flex-col items-end gap-3">
                <div className="flex rounded-full border border-zinc-700/80 bg-zinc-950/80 p-0.5 backdrop-blur-md">
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                      officeView === "iso"
                        ? "bg-zinc-100 text-zinc-900"
                        : "text-zinc-300 hover:text-white"
                    }`}
                    onClick={() => {
                      setOfficeView("iso");
                      window.localStorage.setItem(OFFICE_VIEW_KEY, "iso");
                    }}
                  >
                    Isometric
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                      officeView === "3d"
                        ? "bg-zinc-100 text-zinc-900"
                        : "text-zinc-300 hover:text-white"
                    }`}
                    onClick={() => {
                      setOfficeView("3d");
                      window.localStorage.setItem(OFFICE_VIEW_KEY, "3d");
                    }}
                  >
                    3D
                  </button>
                </div>
                <OfficeEditorHud
                  editing={editingOffice}
                  dirty={officeDirty}
                  busy={officeBusy}
                  tool={officeTool}
                  color={officeColor}
                  yaw={officeYaw}
                  layoutName={layoutName}
                  layouts={data.officeLayouts ?? []}
                  activeLayoutId={data.officeLayout?.id ?? null}
                  onToggleEdit={() => {
                    if (editingOffice) {
                      editingOfficeRef.current = false;
                      void (async () => {
                        if (officeDirty) await saveOfficeLayout();
                        setEditingOffice(false);
                      })();
                      return;
                    }
                    editingOfficeRef.current = true;
                    if (!officeDraft && data.officeLayout) {
                      setOfficeDraft(cloneBlueprint(data.officeLayout.data));
                      setLayoutName(data.officeLayout.name);
                    }
                    setEditingOffice(true);
                  }}
                  onTool={setOfficeTool}
                  onColor={setOfficeColor}
                  onRotate={rotateOfficePlacement}
                  onRename={(name) => {
                    setLayoutName(name);
                    setOfficeDirty(true);
                  }}
                  onSave={() => void saveOfficeLayout()}
                  onCreate={(name, source) => {
                    setOfficeBusy(true);
                    editingOfficeRef.current = false;
                    void fetch("/api/workspace/layouts", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "create",
                        name,
                        source,
                        copyId: source === "copy" ? data.officeLayout?.id : undefined,
                      }),
                    })
                      .then(() => load())
                      .finally(() => {
                        setOfficeBusy(false);
                        editingOfficeRef.current = true;
                        setEditingOffice(true);
                        setOfficeDirty(false);
                      });
                  }}
                  onActivate={(id) => {
                    setOfficeBusy(true);
                    void fetch(`/api/workspace/layouts/${id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "activate" }),
                    })
                      .then(() => load())
                      .finally(() => setOfficeBusy(false));
                  }}
                  onDelete={(id) => {
                    setOfficeBusy(true);
                    void fetch(`/api/workspace/layouts/${id}`, { method: "DELETE" })
                      .then(() => load())
                      .finally(() => setOfficeBusy(false));
                  }}
                  onRestoreHq={() => {
                    setOfficeBusy(true);
                    void fetch("/api/workspace/layouts", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "restore_hq" }),
                    })
                      .then(async (res) => {
                        const json = await res.json();
                        await load();
                        if (json.data) {
                          setOfficeDraft(cloneBlueprint(json.data));
                          setLayoutName("HQ");
                          setOfficeDirty(false);
                        }
                      })
                      .finally(() => setOfficeBusy(false));
                  }}
                />
              </div>
            </div>
            </div>

            {!runId && (
              <div className="pointer-events-auto mx-auto flex w-full max-w-2xl max-h-[calc(100dvh-7rem)] flex-col justify-end gap-2">
                <div className="min-h-0 space-y-2 overflow-y-auto">
                  <p className="text-center text-sm font-medium text-zinc-100 drop-shadow">
                    Your office is live — tell the team what to build
                  </p>

                  {conversationsReady &&
                    showWelcomeTips &&
                    conversations.length === 0 && (
                      <WelcomePanel
                        onPickExample={setCeoGoal}
                        onDismiss={() => {
                          try {
                            window.localStorage.setItem(WELCOME_TIPS_DISMISS_KEY, "1");
                          } catch {
                            /* ignore quota / private mode */
                          }
                          setShowWelcomeTips(false);
                        }}
                      />
                    )}

                  <RunReadinessChecklist
                      workspaceId={data.workspace.id}
                      provider={runProvider}
                      model={runModel}
                      onProviderChange={setRunProvider}
                      onModelChange={setRunModel}
                      onOpenSettings={() => setSettingsOpen(true)}
                      credentialsRevision={credentialsRevision}
                      compact
                      onReadinessChange={(canStart, reason) => {
                        setRunReady(canStart);
                        setRunReadyReason(reason);
                      }}
                    />
                </div>

                <div className="shrink-0">
                  <GoalComposer
                    value={ceoGoal}
                    onChange={setCeoGoal}
                    onSubmit={() => void startRun()}
                    disabled={!runReady || Boolean(data.usage && !data.usage.canRun)}
                    submitting={running}
                    showExamples={
                      conversationsReady &&
                      !(showWelcomeTips && conversations.length === 0)
                    }
                    compact
                    placeholder="What should we build?"
                    submitLabel="Start"
                  />
                  {data.usage && !data.usage.canRun && (
                    <p className="mt-2 text-center text-[11px] text-amber-400/90">
                      {data.usage.reason ??
                        `${data.usage.used}/${data.usage.limit} runs used this month. Resume an existing chat anytime.`}
                    </p>
                  )}
                  {data.usage?.canRun && (
                    <p className="mt-2 text-center text-[11px] text-zinc-600">
                      Free beta · {data.usage.used}/{data.usage.limit} new runs this month
                    </p>
                  )}
                  {!runReady && runReadyReason && (
                    <p className="mt-2 text-center text-[11px] text-amber-400/90">
                      {runReadyReason}
                    </p>
                  )}
                </div>
              </div>
            )}
              </>
            )}
          </div>
        </section>

        {runId && (
          <aside className="hidden w-80 shrink-0 flex-col border-l border-zinc-800/80 bg-zinc-950 lg:flex">
            {filesAside}
          </aside>
        )}

        {mobilePane === "chats" && (
          <div className="absolute inset-0 z-20 flex lg:hidden">
            <div className="flex h-full w-72 flex-col border-r border-zinc-800 bg-zinc-950">
              {chatsAside}
            </div>
            <button
              type="button"
              className="flex-1 bg-black/50"
              aria-label="Close chats"
              onClick={() => setMobilePane("work")}
            />
          </div>
        )}

        {mobilePane === "files" && (
          <div className="absolute inset-0 z-20 flex lg:hidden">
            <button
              type="button"
              className="flex-1 bg-black/50"
              aria-label="Close files"
              onClick={() => setMobilePane("work")}
            />
            <div className="flex h-full w-80 max-w-[85vw] flex-col border-l border-zinc-800 bg-zinc-950">
              {filesAside}
            </div>
          </div>
        )}
      </div>

      {deliverableAction && (
        <DeliverableActionSheet
          key={`${deliverableAction}-${runId ?? "none"}`}
          open
          mode={deliverableAction}
          priorBrief={baseGoalFromRunGoal(ceoGoal)}
          initialDraft={
            deliverableAction === "follow-up" ? "" : baseGoalFromRunGoal(ceoGoal)
          }
          onClose={closeDeliverableSheet}
          onStart={(goalText) => void startFromDeliverableSheet(goalText)}
          busy={deliverableSheetBusy}
          error={deliverableSheetError}
          canStart={runReady}
          canStartReason={runReadyReason}
          usageBlockedReason={
            data.usage && !data.usage.canRun
              ? (data.usage.reason ??
                `Free beta limit reached (${data.usage.used}/${data.usage.limit} runs this month).`)
              : null
          }
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        workspaceId={data.workspace.id}
        agents={data.agents}
        runProvider={runProvider}
        runModel={runModel}
        onProviderChange={setRunProvider}
        onModelChange={setRunModel}
        onCredentialsChange={() => setCredentialsRevision((n) => n + 1)}
        onProviderTestResult={(ok) => {
          setCredentialsRevision((n) => n + 1);
          if (ok) {
            setRunReady(true);
            setRunReadyReason(null);
          }
        }}
        onLogout={logout}
        onRefresh={async () => {
          await load();
        }}
        onAgentRemoved={(id) => {
          if (selectedAgentId === id) {
            setSelectedAgentId(null);
            setInspectorOpen(false);
          }
        }}
      />

      <Dialog
        open={newChatDialogOpen}
        onClose={() => setNewChatDialogOpen(false)}
        title="Start a new chat?"
        description="Your team is still working. They’ll keep going in the background — open that chat later to watch."
        confirmLabel="New chat"
        onConfirm={() => {
          setNewChatDialogOpen(false);
          blankConversation();
        }}
      />

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
        ceoGoal={ceoGoal}
        tasks={tasks}
        agents={data.agents.map((a) => ({ id: a.id, name: a.name }))}
      />
    </div>
  );
}
