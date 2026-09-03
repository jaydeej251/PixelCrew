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
  executionId?: string;
  attemptId?: string;
  toolEventId?: string;
  checkResultId?: string;
  approvalId?: string;
  toolName?: string;
  checkName?: string;
  status?: string;
  sequence?: number;
  summary?: string;
  x?: number;
  y?: number;
};

export type RunEventMessage = {
  id: string;
  type: EventType;
  payload: AgentEventPayload;
  createdAt: string;
  agentId?: string | null;
  sourceKind?: string | null;
  sourceId?: string | null;
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
  EXECUTION_STARTED: "Execution started",
  TOOL_STARTED: "Tool started",
  TOOL_COMPLETED: "Tool completed",
  TOOL_FAILED: "Tool failed",
  CHECK_PASSED: "Check passed",
  CHECK_FAILED: "Check failed",
  APPROVAL_REQUIRED: "Approval required",
  APPROVAL_RESOLVED: "Approval resolved",
  DIFF_READY: "Changes ready",
  EXECUTION_COMPLETED: "Execution completed",
  SANDBOX_TERMINATED: "Sandbox terminated",
};

/** Status changes the CEO should see. Token stream is AGENT_THINKING — show that as live text, not log rows.
 * Execution ledger milestones stay out of the office feed until tools/approvals are product-visible;
 * TASK_* / AGENT_* already cover the CEO narrative. */
export function isMilestoneEvent(type: EventType): boolean {
  return (
    type !== "AGENT_THINKING" &&
    type !== "EXECUTION_STARTED" &&
    type !== "EXECUTION_COMPLETED" &&
    type !== "TOOL_STARTED" &&
    type !== "TOOL_COMPLETED" &&
    type !== "TOOL_FAILED" &&
    type !== "CHECK_PASSED" &&
    type !== "CHECK_FAILED" &&
    type !== "APPROVAL_REQUIRED" &&
    type !== "APPROVAL_RESOLVED" &&
    type !== "DIFF_READY" &&
    type !== "SANDBOX_TERMINATED"
  );
}

export function joinedThinking(events: RunEventMessage[]): string {
  return events
    .filter((e) => e.type === "AGENT_THINKING")
    .map((e) => e.payload.message ?? "")
    .join("");
}
