import type { EventType } from "@prisma/client";

export type AgentEventPayload = {
  agentId?: string;
  agentName?: string;
  position?: string;
  message?: string;
  /** What we asked the agent (user prompt / brief) — stored on TASK_STARTED for review. */
  brief?: string;
  targetPosition?: string;
  targetAgentId?: string;
  taskId?: string;
  taskTitle?: string;
  x?: number;
  y?: number;
};

export type RunEventMessage = {
  id: string;
  type: EventType;
  payload: AgentEventPayload;
  createdAt: string;
  agentId?: string | null;
};

export const EVENT_LABELS: Record<EventType, string> = {
  TASK_CLAIMED: "Task claimed",
  TASK_STARTED: "Started task",
  AGENT_THINKING: "Thinking",
  AGENT_HANDOFF: "Handoff",
  AGENT_BLOCKED: "Blocked",
  AGENT_ERROR: "Error",
  AGENT_TASK_DONE: "Task done",
  RUN_COMPLETED: "Team finished",
  RUN_CANCELLED: "Run cancelled",
};

/** Status changes the CEO should see. Token stream is AGENT_THINKING — show that as live text, not log rows. */
export function isMilestoneEvent(type: EventType): boolean {
  return type !== "AGENT_THINKING";
}

export function joinedThinking(events: RunEventMessage[]): string {
  return events
    .filter((e) => e.type === "AGENT_THINKING")
    .map((e) => e.payload.message ?? "")
    .join("");
}
