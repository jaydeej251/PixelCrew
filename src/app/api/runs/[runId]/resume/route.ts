import { NextResponse } from "next/server";
import type { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest";
import { runOrchestrator } from "@/lib/orchestrator";
import { prepareWorkspaceBrainsForRun } from "@/lib/run-setup";
import { isResumable, prepareRunForResume, resumePhase } from "@/lib/run-resume";
import { assertRunAccess, requireProductSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api-error";
import {
  hasOpenSoftTokenGate,
  TOKEN_HARD_GATE,
  TOKEN_SPEND_CONFIRMED_TITLE,
} from "@/lib/token-spend-gate";
import {
  countQaReworkRounds,
  QA_MAX_REWORK_ROUNDS,
  QA_REWORK_EXTENDED_TITLE,
  qaReworkRoundLimit,
} from "@/lib/qa-verdict";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const session = await requireProductSession();
    const { runId } = await params;
    await assertRunAccess(runId, session);

    const run = await prisma.run.findUnique({
      where: { id: runId },
      include: {
        tasks: { select: { status: true, title: true } },
        artifacts: { select: { title: true, content: true } },
      },
    });
    if (!run || run.archivedAt) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (run.status === "paused") {
      return NextResponse.json(
        { error: "Plan is in review. Publish it to continue building." },
        { status: 400 },
      );
    }

    if (run.status === "running" || run.status === "pending") {
      return NextResponse.json({ error: "This chat is already running" }, { status: 409 });
    }

    if (!isResumable(run)) {
      return NextResponse.json({ error: "This chat cannot be resumed" }, { status: 400 });
    }

    let provider: ProviderType | undefined;
    let model: string | undefined;
    let confirmTokenSpend = false;
    try {
      const body = await req.json();
      if (typeof body.provider === "string") provider = body.provider as ProviderType;
      if (typeof body.model === "string") model = body.model;
      if (body.confirmTokenSpend === true) confirmTokenSpend = true;
    } catch {
      // empty body is fine — fall back to the workspace's current agent settings
    }

    if (hasOpenSoftTokenGate(run.artifacts) && !confirmTokenSpend) {
      return NextResponse.json(
        {
          error:
            "This chat passed the soft token gate. Confirm to continue spending, or start a new chat.",
          tokenGate: "soft",
        },
        { status: 400 },
      );
    }

    if (!provider) {
      const sample = await prisma.agent.findFirst({
        where: { workspaceId: run.workspaceId },
        select: { provider: true, model: true },
      });
      provider = sample?.provider ?? "mock";
      model = model || sample?.model;
    }

    const brains = await prepareWorkspaceBrainsForRun(run.workspaceId, provider, model);
    if (!brains.ok) {
      return NextResponse.json({ error: brains.error }, { status: 400 });
    }

    if (confirmTokenSpend && hasOpenSoftTokenGate(run.artifacts)) {
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

    // Resume after QA exhaust = CEO wants more fix rounds (not a token issue).
    const usedRounds = countQaReworkRounds(run.tasks);
    const roundLimit = qaReworkRoundLimit(run.artifacts);
    if (usedRounds >= roundLimit) {
      await prisma.artifact.create({
        data: {
          runId,
          type: "other",
          title: QA_REWORK_EXTENDED_TITLE,
          content: JSON.stringify({
            extraRounds: QA_MAX_REWORK_ROUNDS,
            previousLimit: roundLimit,
            honestRecheckPending: true,
            at: new Date().toISOString(),
          }),
        },
      });
    }

    // Same run row — does not create a Run, so checkPlanLimits (runs/month) is not charged.
    await prepareRunForResume(runId, run.workspaceId, provider, model);

    if (process.env.INNGEST_EVENT_KEY) {
      await inngest.send({ name: "run/started", data: { runId } });
    } else {
      runOrchestrator(runId).catch(console.error);
    }

    return NextResponse.json({
      runId,
      phase: resumePhase(run.artifacts),
      provider: brains.provider,
      model: brains.model,
      qaReworkExtended: usedRounds >= roundLimit,
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
