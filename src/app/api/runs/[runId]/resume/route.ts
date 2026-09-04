import { NextResponse } from "next/server";
import type { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest";
import { runOrchestrator } from "@/lib/orchestrator";
import { workspaceHasProvider } from "@/lib/run-setup";
import { isResumable, prepareRunForResume, resumePhase } from "@/lib/run-resume";
import { AuthError, assertRunAccess, requireProductSession } from "@/lib/auth";

function authErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.message === "Unauthorized" ? 401 : 404 });
  }
  throw err;
}

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
        tasks: { select: { status: true } },
        artifacts: { select: { title: true } },
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
    try {
      const body = await req.json();
      if (typeof body.provider === "string") provider = body.provider as ProviderType;
      if (typeof body.model === "string") model = body.model;
    } catch {
      // empty body is fine — fall back to the workspace's current agent settings
    }

    if (!provider) {
      const sample = await prisma.agent.findFirst({
        where: { workspaceId: run.workspaceId },
        select: { provider: true, model: true },
      });
      provider = sample?.provider ?? "mock";
      model = model || sample?.model;
    }

    if (provider !== "mock") {
      const check = await workspaceHasProvider(run.workspaceId, provider);
      if (!check.ready) {
        return NextResponse.json(
          {
            error: `No key for ${provider}. Add it in settings or .env.local, then resume.`,
          },
          { status: 400 },
        );
      }
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
      provider,
      model: model ?? null,
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}
