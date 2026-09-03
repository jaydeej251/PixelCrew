import type { RunEventMessage } from "./events";
import { joinedThinking } from "./events";

export type ThoughtTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  position: string;
  output: string | null;
  claimedById: string | null;
  completedAt: string | null;
  createdAt?: string;
};

export type ThoughtStep = {
  id: string;
  agentId?: string | null;
  agentName: string;
  taskTitle: string;
  status: string;
  /** What we asked this teammate to do (CEO-facing brief). */
  brief: string;
  /** What they wrote / streamed while working. */
  thinking: string;
  /** Final saved output for the task, if any. */
  result: string;
  startedAt?: string;
  finishedAt?: string;
};

export type ThoughtProcess = {
  ceoGoal: string;
  steps: ThoughtStep[];
};

function agentNameFromEvents(
  events: RunEventMessage[],
  agentId: string | null | undefined,
  agents: Array<{ id: string; name: string }>,
) {
  if (!agentId) return "Team";
  const fromAgent = agents.find((a) => a.id === agentId)?.name;
  if (fromAgent) return fromAgent;
  const fromEvent = [...events]
    .reverse()
    .find((e) => (e.agentId === agentId || e.payload.agentId === agentId) && e.payload.agentName);
  return fromEvent?.payload.agentName ?? "Teammate";
}

function briefForTask(task: ThoughtTask, events: RunEventMessage[]): string {
  const started = events.find(
    (e) => e.type === "TASK_STARTED" && e.payload.taskId === task.id && e.payload.brief,
  );
  if (started?.payload.brief?.trim()) return started.payload.brief.trim();
  const parts = [task.title];
  if (task.description?.trim()) parts.push(task.description.trim());
  return parts.join("\n\n");
}

function thinkingForTask(taskId: string, events: RunEventMessage[]): string {
  return events
    .filter((e) => e.type === "AGENT_THINKING" && e.payload.taskId === taskId)
    .map((e) => e.payload.message ?? "")
    .join("");
}

function thinkingForAgent(
  agentId: string | null | undefined,
  events: RunEventMessage[],
  excludeTaskIds: Set<string>,
): string {
  if (!agentId) return "";
  return events
    .filter(
      (e) =>
        e.type === "AGENT_THINKING" &&
        (e.agentId === agentId || e.payload.agentId === agentId) &&
        (!e.payload.taskId || !excludeTaskIds.has(e.payload.taskId)),
    )
    .map((e) => e.payload.message ?? "")
    .join("");
}

/** Rebuild per-agent live text from stored thinking events (e.g. after reload). */
export function streamsFromEvents(events: RunEventMessage[]): Record<string, string> {
  const byAgent = new Map<string, RunEventMessage[]>();
  for (const e of events) {
    if (e.type !== "AGENT_THINKING") continue;
    const id = e.agentId ?? e.payload.agentId;
    if (!id) continue;
    const list = byAgent.get(id) ?? [];
    list.push(e);
    byAgent.set(id, list);
  }
  const out: Record<string, string> = {};
  for (const [id, list] of byAgent) {
    out[id] = joinedThinking(list);
  }
  return out;
}

/**
 * CEO-facing timeline: your request → each teammate's brief → what they wrote.
 * Prefers task-scoped thinking; falls back to agent-scoped streams for older runs.
 */
export function buildThoughtProcess(opts: {
  ceoGoal: string;
  tasks: ThoughtTask[];
  events: RunEventMessage[];
  agents: Array<{ id: string; name: string }>;
}): ThoughtProcess {
  const { ceoGoal, tasks, events, agents } = opts;
  const workTasks = tasks
    .filter((t) => t.status !== "queued" || Boolean(t.output?.trim()) || Boolean(t.claimedById))
    .sort((a, b) => {
      const aT = a.completedAt ?? a.createdAt ?? "";
      const bT = b.completedAt ?? b.createdAt ?? "";
      return aT.localeCompare(bT);
    });

  const taskIds = new Set(workTasks.map((t) => t.id));
  const steps: ThoughtStep[] = workTasks.map((task) => {
    const agentId = task.claimedById;
    let thinking = thinkingForTask(task.id, events);
    if (!thinking.trim() && agentId) {
      thinking = thinkingForAgent(agentId, events, taskIds);
    }
    const started = events.find(
      (e) => e.type === "TASK_STARTED" && (e.payload.taskId === task.id || e.payload.taskTitle === task.title),
    );
    const finished = events.find(
      (e) => e.type === "AGENT_TASK_DONE" && e.payload.taskId === task.id,
    );
    return {
      id: task.id,
      agentId,
      agentName: agentNameFromEvents(events, agentId, agents),
      taskTitle: task.title,
      status: task.status,
      brief: briefForTask(task, events),
      thinking: thinking.trim(),
      result: (task.output ?? "").trim(),
      startedAt: started?.createdAt,
      finishedAt: finished?.createdAt ?? task.completedAt ?? undefined,
    };
  });

  return { ceoGoal: ceoGoal.trim(), steps };
}
