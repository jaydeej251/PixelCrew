import type { Agent } from "@prisma/client";
import type { PositionKey } from "./constants";

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

/** Positions that can claim Engineering-stage implement / QA-fix tasks. */
export const BUILD_STAGE_POSITIONS = [
  ...ENGINEER_POSITIONS,
  "tech_architect",
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

/** Engineers plus Senior Developer when they are the build capacity (BR-10/11). */
export function buildersOnTeam<T extends { position: string }>(agents: T[]): T[] {
  const engineers = engineersOnTeam(agents);
  if (engineers.length > 0) return engineers;
  return agents.filter((a) => a.position === "tech_architect");
}

export function qaOnTeam<T extends { position: string }>(agents: T[]): T[] {
  return agents.filter((a) => a.position === "qa_engineer");
}

/** Product policy: every ship path must have a QA seat (LLM review + rework loop). */
export const MANDATORY_QA_POSITION = "qa_engineer" as const;

/**
 * Skip surprise engineer / FE / BE hires when a senior or generalist already
 * covers build (beta R004 / BR-10). Council and other roles pass through.
 * QA is never filtered out — it is mandatory for ship review.
 */
export function filterAutoHireRoles(
  existing: { position: string }[],
  requested: PositionKey[],
): PositionKey[] {
  const have = new Set(existing.map((a) => a.position));
  const batch = new Set(requested);
  const seniorCovers =
    have.has("tech_architect") || batch.has("tech_architect");
  const generalistCovers = have.has("engineer");
  const specialistPresent =
    have.has("frontend_engineer") || have.has("backend_engineer");

  return [...new Set(requested)].filter((pos) => {
    if (pos === MANDATORY_QA_POSITION) return true;
    if (pos === "engineer") {
      if (have.has("engineer")) return true;
      if (seniorCovers) return false;
      if (specialistPresent) return false;
      return true;
    }
    if (pos === "frontend_engineer" || pos === "backend_engineer") {
      if (have.has(pos)) return true;
      if (seniorCovers || generalistCovers || batch.has("engineer")) return false;
      return true;
    }
    return true;
  });
}

/**
 * If the team has a single engineer of any kind, every build task
 * is tagged with that person's position so they own FE and BE.
 * If both frontend and backend exist, work is split.
 * If no engineer seats remain but Senior Developer does, they build (BR-10/11).
 */
export function engineeringAssignment(agents: Agent[]): {
  mode: "none" | "solo" | "split" | "same";
  positions: string[];
  soloPosition?: string;
} {
  const list = engineersOnTeam(agents);
  if (list.length === 0) {
    const senior = agents.find((a) => a.position === "tech_architect");
    if (senior) {
      return {
        mode: "solo",
        positions: ["tech_architect"],
        soloPosition: "tech_architect",
      };
    }
    return { mode: "none", positions: [] };
  }

  const positions = [...new Set(list.map((a) => a.position))];
  if (list.length === 1 || positions.length === 1) {
    return { mode: list.length === 1 ? "solo" : "same", positions, soloPosition: positions[0] };
  }

  const hasFe = positions.includes("frontend_engineer");
  const hasBe = positions.includes("backend_engineer");
  if (hasFe && hasBe) return { mode: "split", positions: ["frontend_engineer", "backend_engineer"] };

  return { mode: "same", positions, soloPosition: positions[0] };
}

export function isSoloSeniorBuild(assignment: {
  mode: string;
  soloPosition?: string;
}): boolean {
  return assignment.mode === "solo" && assignment.soloPosition === "tech_architect";
}
