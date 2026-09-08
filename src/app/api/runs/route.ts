import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest";
import { ArtifactType, ProviderType } from "@prisma/client";
import { z } from "zod";
import { runOrchestrator } from "@/lib/orchestrator";
import { prepareWorkspaceBrainsForRun } from "@/lib/run-setup";
import { normalizeNewRunGoal } from "@/lib/run-goal";
import {
  FOLLOW_UP_FROM_RUN_TITLE,
  isFollowUpGoal,
} from "@/lib/follow-up-goal";
import {
  CARRY_FORWARD_SUMMARY_TITLE,
  buildCarryForwardSummary,
  seedCarryForwardArtifacts,
} from "@/lib/run-continue";
import {
  assertRunAccess,
  assertWorkspaceAccess,
  checkPlanLimits,
  deriveRunTitle,
  requireProductSession,
} from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api-error";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { isQaReviewTitle } from "@/lib/qa-verdict";

const createRunSchema = z
  .object({
    workspaceId: z.string().min(1),
    ceoGoal: z.string().trim().min(1).max(20_000),
    provider: z.nativeEnum(ProviderType).default("mock"),
    model: z.string().trim().min(1).max(200).optional(),
    /** Prior chat when Request changes / continue-carry — copy code artifacts so patches are surgical. */
    parentRunId: z.string().min(1).optional(),
  })
  .strict();

export async function POST(req: Request) {
  try {
    const session = await requireProductSession();
    const rateLimit = await consumeRateLimit({
      scope: "run-create-organization",
      identifier: session.organizationId,
      limit: 20,
      windowMs: 60 * 60_000,
    });
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

    const parsed = createRunSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "A CEO goal is required for every new run." },
        { status: 400 },
      );
    }
    const { workspaceId, provider, model, parentRunId } = parsed.data;
    const goal = normalizeNewRunGoal(parsed.data.ceoGoal);
    if (!goal) {
      return NextResponse.json(
        { error: "A CEO goal is required for every new run." },
        { status: 400 },
      );
    }

    await assertWorkspaceAccess(workspaceId, session);

    const limits = await checkPlanLimits(session.organizationId);
    if (!limits.canRun) {
      return NextResponse.json({ error: limits.reason }, { status: 403 });
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (parentRunId) {
      await assertRunAccess(parentRunId, session);
      const parent = await prisma.run.findUnique({
        where: { id: parentRunId },
        select: { workspaceId: true, archivedAt: true },
      });
      if (!parent || parent.archivedAt || parent.workspaceId !== workspaceId) {
        return NextResponse.json(
          { error: "Parent chat not found in this workspace." },
          { status: 400 },
        );
      }
      // Fail before creating a run so continue-without-files does not burn a monthly run.
      if (isFollowUpGoal(goal)) {
        const priorCount = await prisma.artifact.count({
          where: { runId: parentRunId, type: "code", filePath: { not: null } },
        });
        if (priorCount === 0) {
          return NextResponse.json(
            {
              error:
                "This chat has no shipped app files to continue. Use Restart with a new brief instead.",
            },
            { status: 400 },
          );
        }
      }
    }

    const providerType = provider;
    const brains = await prepareWorkspaceBrainsForRun(workspaceId, providerType, model);
    if (!brains.ok) {
      return NextResponse.json({ error: brains.error }, { status: 400 });
    }

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { concurrencyCap: 2 },
    });
    await prisma.agent.updateMany({
      where: { workspaceId },
      data: { status: "idle" },
    });

    const run = await prisma.run.create({
      data: {
        workspaceId,
        ceoGoal: goal,
        title: deriveRunTitle(goal),
        status: "pending",
      },
    });

    // Request changes / continue-carry: seed the prior app so engineers patch instead of redesigning.
    if (parentRunId && isFollowUpGoal(goal)) {
      const priorCode = await prisma.artifact.findMany({
        where: { runId: parentRunId, type: "code", filePath: { not: null } },
        select: { type: true, title: true, content: true, filePath: true },
      });
      const parentTasks = await prisma.task.findMany({
        where: { runId: parentRunId },
        select: { title: true, output: true, status: true },
        orderBy: { createdAt: "asc" },
      });
      const cancelEvent = await prisma.runEvent.findFirst({
        where: { runId: parentRunId, type: "RUN_CANCELLED" },
        orderBy: { createdAt: "desc" },
        select: { payload: true },
      });
      const cancelPayload = cancelEvent?.payload as { message?: unknown } | null;
      const priorStopMessage =
        typeof cancelPayload?.message === "string" ? cancelPayload.message : null;
      const summary = buildCarryForwardSummary({
        artifacts: priorCode,
        tasks: parentTasks.filter((t) => isQaReviewTitle(t.title) || Boolean(t.output)),
        runError: priorStopMessage,
      });
      const seedRows = seedCarryForwardArtifacts({
        parentRunId,
        priorCode,
        summary,
      });
      await prisma.artifact.createMany({
        data: seedRows.map((a) => ({
          runId: run.id,
          type: a.type as ArtifactType,
          title: a.title,
          content: a.content,
          ...(a.filePath ? { filePath: a.filePath } : {}),
        })),
      });
      await prisma.artifact.create({
        data: {
          runId: run.id,
          type: "other",
          title: FOLLOW_UP_FROM_RUN_TITLE,
          content: JSON.stringify({
            parentRunId,
            copiedFiles: priorCode.length,
            carryForward: true,
            summaryTitle: CARRY_FORWARD_SUMMARY_TITLE,
            at: new Date().toISOString(),
          }),
        },
      });
    }

    if (process.env.INNGEST_EVENT_KEY) {
      await inngest.send({ name: "run/started", data: { runId: run.id } });
    } else {
      runOrchestrator(run.id).catch(console.error);
    }

    return NextResponse.json({
      runId: run.id,
      provider: brains.provider,
      model: brains.model,
      followUpFrom: parentRunId && isFollowUpGoal(goal) ? parentRunId : undefined,
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function GET() {
  try {
    const session = await requireProductSession();
    const runs = await prisma.run.findMany({
      where: {
        archivedAt: null,
        workspace: { organizationId: session.organizationId },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        ceoGoal: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        totalTokens: true,
        estCostUsd: true,
      },
    });
    return NextResponse.json(runs);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
