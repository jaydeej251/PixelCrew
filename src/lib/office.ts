import type { AgentStatus } from "@prisma/client";
import type { RunEventMessage } from "./events";

export type OfficeAgent = {
  id: string;
  name: string;
  position: string;
  positionLabel: string;
  jobBoundary: string;
  status: AgentStatus;
  avatarColor: string;
  provider?: string;
  model?: string;
  desk?: { x: number; y: number; label: string; room: string } | null;
  department?: { name: string; color: string } | null;
};

export const SIMULATED_EVENTS: Omit<RunEventMessage, "id" | "createdAt">[] = [
  {
    type: "TASK_CLAIMED",
    agentId: "fe-1",
    payload: { agentId: "fe-1", agentName: "Sam Rivera", position: "frontend_engineer", taskTitle: "Build login UI" },
  },
  {
    type: "TASK_STARTED",
    agentId: "fe-1",
    payload: { agentId: "fe-1", agentName: "Sam Rivera", taskTitle: "Build login UI" },
  },
  {
    type: "TASK_CLAIMED",
    agentId: "fe-2",
    payload: { agentId: "fe-2", agentName: "Casey Kim", position: "frontend_engineer", taskTitle: "Build dashboard UI" },
  },
  {
    type: "TASK_STARTED",
    agentId: "fe-2",
    payload: { agentId: "fe-2", agentName: "Casey Kim", taskTitle: "Build dashboard UI" },
  },
  {
    type: "AGENT_THINKING",
    agentId: "fe-1",
    payload: { agentId: "fe-1", message: "Scaffolding login form components..." },
  },
  {
    type: "AGENT_THINKING",
    agentId: "fe-2",
    payload: { agentId: "fe-2", message: "Building habit streak visualization..." },
  },
  {
    type: "AGENT_HANDOFF",
    agentId: "fe-1",
    payload: { agentId: "fe-1", targetPosition: "backend_engineer", message: "Need auth API contract" },
  },
  {
    type: "AGENT_TASK_DONE",
    agentId: "fe-2",
    payload: { agentId: "fe-2", taskTitle: "Build dashboard UI" },
  },
  {
    type: "RUN_COMPLETED",
    payload: { message: "Simulation complete" },
  },
];

export function statusToAnimation(status: AgentStatus): string {
  switch (status) {
    case "working":
      return "typing";
    case "walking":
    case "handoff":
      return "walking";
    case "blocked":
    case "error":
      return "blocked";
    default:
      return "idle";
  }
}
