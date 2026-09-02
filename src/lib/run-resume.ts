import type { ProviderType } from "@prisma/client";
import { prisma } from "./db";
import { configureAgentsForRun } from "./run-setup";
import { PLAN_PUBLISHED_TITLE } from "./workflow";

export const RESUMABLE_RUN_STATUSES = ["cancelled", "failed"] as const;

export type RunResumeSnapshot = {
  status: string;
  tasks: Array<{ status: string }>;
  artifacts?: Array<{ title: string }>;
};

/** CEO plan-review checkpoint. Continue via publish — not the Stop/Resume path. */
export function isPlanCheckpoint(status: string): boolean {
  return status === "paused";
}

export function isPublishedPlan(artifacts?: Array<{ title: string }>): boolean {
  return Boolean(artifacts?.some((a) => a.title === PLAN_PUBLISHED_TITLE));
}

export function resumePhase(artifacts?: Array<{ title: string }>): "planning" | "build" {
  return isPublishedPlan(artifacts) ? "build" : "planning";
}

export function shouldRequeueTask(status: string): boolean {
  return status === "claimed" || status === "in_progress" || status === "failed";
}

/**
 * True when Stop/failure left work that can continue on the SAME run.
 * `paused` is the planning-council checkpoint and is not resumable this way.
 */
export function isResumable(run: RunResumeSnapshot): boolean {
  if (isPlanCheckpoint(run.status)) return false;
  if (run.status === "completed") return false;
  if (run.status === "running" || run.status === "pending") return false;
  return run.status === "cancelled" || run.status === "failed";
}

/** Reset incomplete work and agents so the orchestrator can re-enter this run. */
export async function prepareRunForResume(
  runId: string,
  workspaceId: string,
  provider: ProviderType,
  model?: string,
) {
  await configureAgentsForRun(workspaceId, provider, model);
  await prisma.agent.updateMany({
    where: { workspaceId },
    data: { status: "idle" },
  });
  await prisma.task.updateMany({
    where: { runId, status: { in: ["claimed", "in_progress", "failed"] } },
    data: { status: "queued", claimedById: null, claimedAt: null },
  });
  await prisma.run.update({
    where: { id: runId },
    data: { status: "pending", completedAt: null },
  });
}
