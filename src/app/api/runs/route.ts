import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest";
import { runOrchestrator } from "@/lib/orchestrator";
import { configureAgentsForRun, workspaceHasProvider } from "@/lib/run-setup";
import type { ProviderType } from "@prisma/client";

export async function POST(req: Request) {
  const body = await req.json();
  const { workspaceId, ceoGoal, provider = "mock", model } = body;

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const providerType = provider as ProviderType;
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

  const goal = ceoGoal ?? workspace.ceoGoal ?? "Build something";
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
    data: { workspaceId, ceoGoal: goal, status: "pending" },
  });

  if (process.env.INNGEST_EVENT_KEY) {
    await inngest.send({ name: "run/started", data: { runId: run.id } });
  } else {
    runOrchestrator(run.id).catch(console.error);
  }

  return NextResponse.json({ runId: run.id, provider: llm.provider, model: llm.model });
}

export async function GET() {
  const runs = await prisma.run.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { artifacts: true },
  });
  return NextResponse.json(runs);
}
