import type { ProviderType } from "@prisma/client";
import { prisma } from "./db";
import { resetExecutionsForRun } from "./execution-runtime";
import {
  FOLLOW_UP_IMPLEMENT_TITLE,
  FOLLOW_UP_UI_TITLE,
  mergeFollowUpChanges,
  parseFollowUpGoal,
  partitionIterateAsks,
  REQUEST_CHANGES_ITERATION_TITLE,
} from "./follow-up-goal";
import { ensureRole } from "./hire";
import { hasPreviewableApp } from "./project-files";
import { buildersOnTeam, qaOnTeam } from "./roster";
import { configureAgentsForRun } from "./run-setup";
import { STATIC_SHIP_BAR } from "./prompts";
import { INITIAL_QA_TITLE } from "./qa-verdict";
import { PLAN_PUBLISHED_TITLE } from "./workflow";

export type IterateRunSnapshot = {
  status: string;
  ceoGoal: string;
  artifacts: Array<{
    type: string;
    title: string;
    content: string;
    filePath?: string | null;
  }>;
};

/**
 * Same-chat Request changes (Claude Code / Codex style): continue on this run.
 * Not available while already running or at the plan-publish pause.
 */
export function canIterateOnRun(run: IterateRunSnapshot): boolean {
  if (run.status === "running" || run.status === "pending" || run.status === "paused") {
    return false;
  }
  if (run.status === "completed") return true;
  return hasPreviewableApp(run.artifacts, run.ceoGoal);
}

function numberedMustFix(changes: string): string {
  const lines = changes
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•–—]\s+/, "").replace(/^---$/, "").trim())
    .filter((l) => l && !/^Next request:/i.test(l));
  if (lines.length === 0) return changes.trim();
  return lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
}

/** Reset agents/executions, merge Changes I want, queue surgical Implement (+ UI) + QA. */
export async function prepareRunForIterate(opts: {
  runId: string;
  workspaceId: string;
  existingGoal: string;
  changes: string;
  provider: ProviderType;
  model?: string;
}): Promise<{ mergedGoal: string }> {
  const changes = opts.changes.trim();
  if (!changes) {
    throw new Error("Describe what you want changed.");
  }

  const mergedGoal = mergeFollowUpChanges(opts.existingGoal, changes);
  const { changes: allOpen } = parseFollowUpGoal(mergedGoal);
  const mustFix = numberedMustFix(allOpen);
  const { bugText, uiText, wantsSplit } = partitionIterateAsks(allOpen);

  await configureAgentsForRun(opts.workspaceId, opts.provider, opts.model);
  await prisma.agent.updateMany({
    where: { workspaceId: opts.workspaceId },
    data: { status: "idle" },
  });

  await prisma.task.updateMany({
    where: {
      runId: opts.runId,
      status: { in: ["queued", "claimed", "in_progress", "blocked", "failed"] },
    },
    data: { status: "failed", output: "Superseded by a newer Request changes on this chat." },
  });
  await resetExecutionsForRun(prisma, opts.runId);

  await prisma.run.update({
    where: { id: opts.runId },
    data: {
      ceoGoal: mergedGoal,
      status: "pending",
      completedAt: null,
    },
  });

  await prisma.artifact.create({
    data: {
      runId: opts.runId,
      type: "other",
      title: REQUEST_CHANGES_ITERATION_TITLE,
      content: JSON.stringify({
        changes,
        allOpen,
        wantsSplit,
        at: new Date().toISOString(),
      }),
    },
  });

  const published = await prisma.artifact.findFirst({
    where: { runId: opts.runId, title: PLAN_PUBLISHED_TITLE },
  });
  if (!published) {
    await prisma.artifact.create({
      data: {
        runId: opts.runId,
        type: "other",
        title: PLAN_PUBLISHED_TITLE,
        content: "Published for in-place Request changes.",
      },
    });
  }

  let agents = await prisma.agent.findMany({ where: { workspaceId: opts.workspaceId } });
  if (buildersOnTeam(agents).length === 0) {
    await ensureRole({
      workspaceId: opts.workspaceId,
      position: "engineer",
      provider: opts.provider,
      model: opts.model ?? "mock",
    });
    if (opts.provider !== "mock") {
      await configureAgentsForRun(opts.workspaceId, opts.provider, opts.model);
    }
    agents = await prisma.agent.findMany({ where: { workspaceId: opts.workspaceId } });
  }

  // Always seat QA on Request changes — otherwise Engineering patches ship with no review.
  if (qaOnTeam(agents).length === 0) {
    await ensureRole({
      workspaceId: opts.workspaceId,
      position: "qa_engineer",
      provider: opts.provider,
      model: opts.model ?? "mock",
    });
    if (opts.provider !== "mock") {
      await configureAgentsForRun(opts.workspaceId, opts.provider, opts.model);
    }
    agents = await prisma.agent.findMany({ where: { workspaceId: opts.workspaceId } });
  }

  const pos = buildersOnTeam(agents)[0]?.position ?? "engineer";
  const buildIds: string[] = [];

  if (wantsSplit) {
    const bugTask = await prisma.task.create({
      data: {
        runId: opts.runId,
        title: FOLLOW_UP_IMPLEMENT_TITLE,
        description:
          `CEO Request-changes — BUG FIX FIRST (same chat):\n${bugText}\n\n` +
          `Full open must-fix list (do not drop older items):\n${mustFix}\n\n` +
          `Fix the bug behavior in JS/HTML first. Do NOT spend this task on a visual redesign.\n` +
          `Emit ONLY changed files as complete \`\`\`file:path fences. Keep the same product.\n` +
          `Do not break shop/inventory/quests/persistence while fixing.\n` +
          STATIC_SHIP_BAR,
        position: pos,
        priority: 85,
        dependsOnIds: [],
      },
    });
    buildIds.push(bugTask.id);

    const uiTask = await prisma.task.create({
      data: {
        runId: opts.runId,
        title: FOLLOW_UP_UI_TITLE,
        description:
          `CEO Request-changes — UI REFRESH (same chat):\n${uiText}\n\n` +
          `Bug-fix task already ran (or is upstream). Refresh CSS/HTML so the look is clearly more modern.\n` +
          `Do NOT re-break the bug fix. Preserve working shop/inventory/quest flows.\n` +
          `Emit ONLY changed files as complete \`\`\`file:path fences.\n` +
          STATIC_SHIP_BAR,
        position: pos,
        priority: 80,
        dependsOnIds: [bugTask.id],
      },
    });
    buildIds.push(uiTask.id);
  } else {
    const work = await prisma.task.create({
      data: {
        runId: opts.runId,
        title: FOLLOW_UP_IMPLEMENT_TITLE,
        description:
          `CEO Request-changes (same chat) — must-fix ALL of these:\n${mustFix}\n\n` +
          `Latest ask:\n${changes}\n\n` +
          `CURRENT app files are already on this run. Satisfy every must-fix item in Preview.\n` +
          `If UI refresh is listed, update CSS/HTML. If bugs are listed, fix real JS/HTML behavior.\n` +
          `Emit ONLY changed files as complete \`\`\`file:path fences. Keep the same product.\n` +
          `Do not break working flows while editing.\n` +
          STATIC_SHIP_BAR,
        position: pos,
        priority: 80,
        dependsOnIds: [],
      },
    });
    buildIds.push(work.id);
  }

  if (qaOnTeam(agents).length > 0 && buildIds.length > 0) {
    await prisma.task.create({
      data: {
        runId: opts.runId,
        title: INITIAL_QA_TITLE,
        description:
          `CEO Request-changes to verify — must-fix list:\n${mustFix}\n\n` +
          `Review CURRENT shipped files against EACH must-fix item.\n` +
          `FAIL if any bug is still broken OR a requested UI refresh has no meaningful CSS/HTML change.\n` +
          `FAIL if a previously working primary control clearly regressed (create/add node, drag, save, shop, etc.).\n` +
          `FAIL if app.js looks like a shell stub (e.g. only "UI shell ready") or is truncated / unparseable vs a prior working script.\n` +
          `Do NOT PASS just because the old product still loads.\n` +
          `Reply format:\n` +
          `Verdict: FAIL or PASS\n` +
          `Then one line per must-fix item:\n` +
          `- [MET] label — evidence\n` +
          `- [MISSING] label — what is absent\n` +
          `Also add [MISSING] Regression: … if create/drag/primary flows died while fixing the ask.\n` +
          `PASS only if every item is [MET] and no regression [MISSING].`,
        position: "qa_engineer",
        priority: 70,
        dependsOnIds: buildIds,
      },
    });
  } else if (buildIds.length > 0) {
    console.warn(
      `[PixelCrew] Request changes queued ${buildIds.length} build task(s) but no QA engineer — patches will not be reviewed.`,
    );
  }

  return { mergedGoal };
}
