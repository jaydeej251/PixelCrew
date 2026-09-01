import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest";
import { runOrchestrator } from "@/lib/orchestrator";

export async function POST(req: Request) {
  const body = await req.json();
  const { workspaceId, ceoGoal } = body;

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const goal = ceoGoal ?? workspace.ceoGoal ?? "Build something";
  const run = await prisma.run.create({
    data: { workspaceId, ceoGoal: goal, status: "pending" },
  });

  if (process.env.INNGEST_EVENT_KEY) {
    await inngest.send({ name: "run/started", data: { runId: run.id } });
  } else {
    runOrchestrator(run.id).catch(console.error);
  }

  return NextResponse.json({ runId: run.id });
}

export async function GET() {
  const runs = await prisma.run.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { artifacts: true },
  });
  return NextResponse.json(runs);
}
