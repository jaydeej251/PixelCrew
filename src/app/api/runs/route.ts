import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest";
import { ProviderType } from "@prisma/client";
import { z } from "zod";
import { runOrchestrator } from "@/lib/orchestrator";
import { configureAgentsForRun, workspaceHasProvider } from "@/lib/run-setup";
import { normalizeNewRunGoal } from "@/lib/run-goal";
import {
  assertWorkspaceAccess,
  checkPlanLimits,
  deriveRunTitle,
  requireProductSession,
} from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api-error";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const createRunSchema = z
  .object({
    workspaceId: z.string().min(1),
    ceoGoal: z.string().trim().min(1).max(20_000),
    provider: z.nativeEnum(ProviderType).default("mock"),
    model: z.string().trim().min(1).max(200).optional(),
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
    const { workspaceId, provider, model } = parsed.data;
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

    const providerType = provider;
    if (providerType !== "mock") {
      const check = await workspaceHasProvider(workspaceId, providerType);
      if (!check.ready) {
        return NextResponse.json(
          {
            error: `No key for ${provider}. Add it in the sidebar or .env.local (OPENROUTER_API_KEY or OPEN_ROUTER_KEY).`,
          },
          { status: 400 },
        );
      }
    }

    const llm = await configureAgentsForRun(workspaceId, providerType, model);

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

    if (process.env.INNGEST_EVENT_KEY) {
      await inngest.send({ name: "run/started", data: { runId: run.id } });
    } else {
      runOrchestrator(run.id).catch(console.error);
    }

    return NextResponse.json({ runId: run.id, provider: llm.provider, model: llm.model });
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
