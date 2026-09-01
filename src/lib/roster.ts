import type { Agent } from "@prisma/client";

export const DISPATCHER_POSITION = "dispatcher";

export const COUNCIL_POSITIONS = [
  "project_manager",
  "tech_architect",
  "designer",
] as const;

/** Who can answer the CEO during plan Q&A (Workspace AI first). */
export const PLANNER_POSITIONS = [
  "dispatcher",
  "project_manager",
  "executive",
  "designer",
] as const;

export const REVIEWER_POSITIONS = [
  "tech_architect",
  "project_manager",
  "executive",
] as const;

export const ENGINEER_POSITIONS = [
  "engineer",
  "frontend_engineer",
  "backend_engineer",
] as const;

export function pickOne<T extends { position: string }>(
  agents: T[],
  preferred: readonly string[],
): T | null {
  for (const position of preferred) {
    const match = agents.find((a) => a.position === position);
    if (match) return match;
  }
  return null;
}

export function engineersOnTeam<T extends { position: string }>(agents: T[]): T[] {
  return agents.filter((a) => ENGINEER_POSITIONS.includes(a.position as (typeof ENGINEER_POSITIONS)[number]));
}

export function qaOnTeam<T extends { position: string }>(agents: T[]): T[] {
  return agents.filter((a) => a.position === "qa_engineer");
}

/**
 * If the team has a single engineer of any kind, every build task
 * is tagged with that person's position so they own FE and BE.
 * If both frontend and backend exist, work is split.
 */
export function engineeringAssignment(agents: Agent[]): {
  mode: "none" | "solo" | "split" | "same";
  positions: string[];
  soloPosition?: string;
} {
  const list = engineersOnTeam(agents);
  if (list.length === 0) return { mode: "none", positions: [] };

  const positions = [...new Set(list.map((a) => a.position))];
  if (list.length === 1 || positions.length === 1) {
    return { mode: list.length === 1 ? "solo" : "same", positions, soloPosition: positions[0] };
  }

  const hasFe = positions.includes("frontend_engineer");
  const hasBe = positions.includes("backend_engineer");
  if (hasFe && hasBe) return { mode: "split", positions: ["frontend_engineer", "backend_engineer"] };

  return { mode: "same", positions, soloPosition: positions[0] };
}
