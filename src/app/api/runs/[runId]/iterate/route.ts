import { NextResponse } from "next/server";
import type { ProviderType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest";
import { runOrchestrator } from "@/lib/orchestrator";
import { prepareWorkspaceBrainsForRun } from "@/lib/run-setup";
import { assertRunAccess, requireProductSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api-error";
import {
  hasOpenSoftTokenGate,
  TOKEN_HARD_GATE,
  TOKEN_SPEND_CONFIRMED_TITLE,
} from "@/lib/token-spend-gate";
import {
  parseRunBrain,
  RUN_BRAIN_TITLE,
  serializeRunBrain,
} from "@/lib/run-brain";
import { canIterateOnRun, prepareRunForIterate } from "@/lib/run-iterate";

const iterateSchema = z
  .object({
    changes: z.string().trim().min(1).max(8_000),
    provider: z.string().optional(),
    model: z.string().trim().min(1).max(200).optional(),
    confirmTokenSpend: z.boolean().optional(),
  })
  .strict();

/**
 * Same-chat Request changes — patches the current run's app (no new monthly run).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const session = await requireProductSession();
    const { runId } = await params;
    await assertRunAccess(runId, session);

    const parsed = iterateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Describe what you want changed." },
        { status: 400 },
      );
    }

    const run = await prisma.run.findUnique({
      where: { id: runId },
      include: {
        artifacts: {
          select: { id: true, type: true, title: true, content: true, filePath: true },
        },
      },
    });
    if (!run || run.archivedAt) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (run.status === "running" || run.status === "pending") {
      return NextResponse.json({ error: "This chat is already running" }, { status: 409 });
    }

    if (run.status === "paused") {
      return NextResponse.json(
        { error: "Plan is in review. Publish it before requesting changes." },
        { status: 400 },
      );
    }

    if (!canIterateOnRun(run)) {
      return NextResponse.json(
        { error: "Request changes needs a finished app on this chat. Finish a build first." },
        { status: 400 },
      );
    }

    if (hasOpenSoftTokenGate(run.artifacts) && parsed.data.confirmTokenSpend !== true) {
      return NextResponse.json(
        {
          error:
            "This chat passed the soft token gate. Confirm to continue spending, or start a new chat.",
          tokenGate: "soft",
        },
        { status: 400 },
      );
    }

    let provider = parsed.data.provider as ProviderType | undefined;
    let model = parsed.data.model;
    if (!provider) {
      const stored = parseRunBrain(
        run.artifacts.find((a) => a.title === RUN_BRAIN_TITLE)?.content,
      );
      if (stored) {
        provider = stored.provider;
        model = model || stored.model;
      } else {
        const sample = await prisma.agent.findFirst({
          where: { workspaceId: run.workspaceId },
          select: { provider: true, model: true },
        });
        provider = sample?.provider ?? "mock";
        model = model || sample?.model;
      }
    }

    const brains = await prepareWorkspaceBrainsForRun(run.workspaceId, provider, model);
    if (!brains.ok) {
      return NextResponse.json({ error: brains.error }, { status: 400 });
    }

    if (parsed.data.confirmTokenSpend === true && hasOpenSoftTokenGate(run.artifacts)) {
      await prisma.artifact.create({
        data: {
          runId,
          type: "other",
          title: TOKEN_SPEND_CONFIRMED_TITLE,
          content: JSON.stringify({
            confirmedThrough: TOKEN_HARD_GATE,
            at: new Date().toISOString(),
            tokensAtConfirm: run.totalTokens,
          }),
        },
      });
    }

    const existingBrain = run.artifacts.find((a) => a.title === RUN_BRAIN_TITLE);
    const brainContent = serializeRunBrain({
      provider: brains.provider,
      model: brains.model,
    });
    if (existingBrain) {
      await prisma.artifact.update({
        where: { id: existingBrain.id },
        data: { content: brainContent },
      });
    } else {
      await prisma.artifact.create({
        data: {
          runId,
          type: "other",
          title: RUN_BRAIN_TITLE,
          content: brainContent,
        },
      });
    }

    const { mergedGoal } = await prepareRunForIterate({
      runId,
      workspaceId: run.workspaceId,
      existingGoal: run.ceoGoal,
      changes: parsed.data.changes,
      provider: brains.provider,
      model: brains.model,
    });

    if (process.env.INNGEST_EVENT_KEY) {
      await inngest.send({ name: "run/started", data: { runId } });
    } else {
      runOrchestrator(runId).catch(console.error);
    }

    return NextResponse.json({
      runId,
      sameChat: true,
      ceoGoal: mergedGoal,
      provider: brains.provider,
      model: brains.model,
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
