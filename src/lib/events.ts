import type { EventType } from "@prisma/client";

export type AgentEventPayload = {
  agentId?: string;
  agentName?: string;
  position?: string;
  message?: string;
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
  RUN_COMPLETED: "Run completed",
  RUN_CANCELLED: "Run cancelled",
};
