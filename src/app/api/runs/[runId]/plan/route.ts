import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createProvider, resolveProviderConfig } from "@/lib/providers";
import { PLANNER_POSITIONS, pickOne } from "@/lib/roster";
import { PLAN_PUBLISHED_TITLE, PLAN_QA_TITLE, pickPlanTask } from "@/lib/workflow";
import { councilThreadFromTasks, plannerSystemPrompt } from "@/lib/prompts";
import { runOrchestrator, publishAndDelegate } from "@/lib/orchestrator";

type QaMessage = { role: "user" | "assistant"; content: string; speaker?: string };

async function getPlanThread(runId: string): Promise<QaMessage[]> {
  const row = await prisma.artifact.findFirst({
    where: { runId, title: PLAN_QA_TITLE },
  });
  if (!row) return [];
  try {
    return JSON.parse(row.content) as QaMessage[];
  } catch {
    return [];
  }
}

async function savePlanThread(runId: string, messages: QaMessage[]) {
  const existing = await prisma.artifact.findFirst({
    where: { runId, title: PLAN_QA_TITLE },
  });
  if (existing) {
    await prisma.artifact.update({
      where: { id: existing.id },
      data: { content: JSON.stringify(messages) },
    });
  } else {
    await prisma.artifact.create({
      data: {
        runId,
        type: "other",
        title: PLAN_QA_TITLE,
        content: JSON.stringify(messages),
      },
    });
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { tasks: true, artifacts: true, workspace: { include: { agents: true } } },
  });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const planTask = pickPlanTask(run.tasks);
  const published = run.artifacts.some((a) => a.title === PLAN_PUBLISHED_TITLE);
  let thread = await getPlanThread(runId);
  if (thread.length === 0) {
    const done = [...run.tasks]
      .filter((t) => t.status === "done")
      .sort((a, b) => (a.completedAt?.getTime() ?? 0) - (b.completedAt?.getTime() ?? 0));
    thread = councilThreadFromTasks(done);
  }

  return NextResponse.json({
    status: run.status,
    ceoGoal: run.ceoGoal,
    plan: planTask?.output ?? "",
    planner: planTask?.position ?? null,
    published,
    thread,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const body = await req.json();
  const action = body.action as "ask" | "publish";

  if (action === "publish") {
    const run = await prisma.run.findUnique({
      where: { id: runId },
      include: { tasks: true, artifacts: true },
    });
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (run.status !== "paused") {
      return NextResponse.json({ error: "Plan is not in review" }, { status: 400 });
    }
    const planTask = pickPlanTask(run.tasks);
    if (!planTask?.output?.trim()) {
      return NextResponse.json({ error: "No combined plan to publish" }, { status: 400 });
    }
    await publishAndDelegate(runId);
    runOrchestrator(runId).catch(console.error);
    return NextResponse.json({ ok: true });
  }

  if (action !== "ask" || !String(body.message ?? "").trim()) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { tasks: true, workspace: { include: { agents: true } } },
  });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (run.status !== "paused") {
    return NextResponse.json({ error: "Plan is not in review" }, { status: 400 });
  }

  const plannerAgent = pickOne(run.workspace.agents, PLANNER_POSITIONS);
  const planTask = pickPlanTask(run.tasks);
  if (!plannerAgent || !planTask) {
    return NextResponse.json({ error: "No plan to revise" }, { status: 400 });
  }

  const question = String(body.message).trim();
  let thread = await getPlanThread(runId);
  if (thread.length === 0) {
    thread = councilThreadFromTasks(run.tasks.filter((t) => t.status === "done"));
  }
  thread.push({ role: "user", content: question });

  const credential = await prisma.providerCredential.findFirst({
    where: { workspaceId: plannerAgent.workspaceId, provider: plannerAgent.provider },
  });
  const config = resolveProviderConfig(
    plannerAgent.provider,
    plannerAgent.model,
    credential ?? undefined,
  );
  config.maxTokens = 2500;
  const llm = createProvider(config, plannerAgent.position, "Revise plan");

  const history = thread.map((m) => ({
    role: m.role,
    content: m.speaker ? `[${m.speaker}]\n${m.content}` : m.content,
  }));

  let reply = "";
  const result = await llm.stream(
    [
      {
        role: "system",
        content: `${plannerSystemPrompt(plannerAgent.name, plannerAgent.positionLabel)} You speak for the planning council (Product, Senior Developer, UI/UX). Never refuse. If the CEO asks for a stack or UX, answer using the council notes.`,
      },
      ...history,
    ],
    (chunk) => {
      reply += chunk.content;
    },
  );
  reply = reply || result.content;

  thread.push({ role: "assistant", content: reply, speaker: "Workspace AI" });
  await savePlanThread(runId, thread);

  const updated = extractUpdatedPlan(reply, planTask.output ?? "");
  if (updated !== planTask.output) {
    await prisma.task.update({
      where: { id: planTask.id },
      data: { output: updated },
    });
    await prisma.artifact.create({
      data: {
        runId,
        type: "prd",
        title: "Plan (revised)",
        content: updated,
      },
    });
  }

  return NextResponse.json({ ok: true, plan: updated, thread });
}

function extractUpdatedPlan(reply: string, previous: string): string {
  const marker = reply.match(/updated plan\s*[:\n]\s*([\s\S]+)/i);
  if (marker && marker[1].trim().length > 200) return marker[1].trim();
  if (reply.length > 400 && reply.length >= previous.length * 0.6) return reply;
  return previous;
}
