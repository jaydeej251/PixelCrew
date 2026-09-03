import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createProvider, resolveProviderConfig } from "@/lib/providers";
import { findProviderCredential } from "@/lib/provider-credentials";
import { PLANNER_POSITIONS, pickOne } from "@/lib/roster";
import {
  PLAN_DECISIONS_TITLE,
  PLAN_PUBLISHED_TITLE,
  PLAN_QA_TITLE,
  pickPlanTask,
} from "@/lib/workflow";
import { councilThreadFromTasks, plannerSystemPrompt } from "@/lib/prompts";
import { runOrchestrator, publishAndDelegate } from "@/lib/orchestrator";
import { AuthError, assertRunAccess, requireSession } from "@/lib/auth";
import {
  allDecisionsAnswered,
  applyAnswer,
  decisionAnswersKey,
  decisionApplyUserPrompt,
  parseDecisionsState,
  picksDifferFromRecommended,
  stripDecisionFence,
  withRecommendedAnswers,
  type PlanDecisionsState,
} from "@/lib/plan-decisions";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const planMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("publish") }).strict(),
  z.object({
    action: z.literal("ask"),
    message: z.string().trim().min(1).max(20_000),
  }).strict(),
  z.object({
    action: z.literal("decide"),
    decisionId: z.string().trim().min(1).max(100).optional(),
    optionId: z.string().trim().min(1).max(100).optional(),
    useRecommended: z.boolean().optional(),
  }).strict().refine(
    (value) =>
      value.useRecommended === true ||
      (value.decisionId !== undefined && value.optionId !== undefined),
    { message: "A decision and option are required" },
  ),
]);

function authErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.message === "Unauthorized" ? 401 : 404 });
  }
  throw err;
}

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

async function getDecisionState(runId: string): Promise<PlanDecisionsState> {
  const row = await prisma.artifact.findFirst({
    where: { runId, title: PLAN_DECISIONS_TITLE },
  });
  if (!row) return { items: [] };
  return parseDecisionsState(row.content);
}

async function saveDecisionState(runId: string, state: PlanDecisionsState) {
  const existing = await prisma.artifact.findFirst({
    where: { runId, title: PLAN_DECISIONS_TITLE },
  });
  const content = JSON.stringify(state);
  if (existing) {
    await prisma.artifact.update({
      where: { id: existing.id },
      data: { content },
    });
  } else {
    await prisma.artifact.create({
      data: {
        runId,
        type: "other",
        title: PLAN_DECISIONS_TITLE,
        content,
      },
    });
  }
}

async function writeRevisedPlan(runId: string, planTaskId: string, plan: string) {
  await prisma.task.update({
    where: { id: planTaskId },
    data: { output: plan },
  });
  await prisma.artifact.create({
    data: {
      runId,
      type: "prd",
      title: "Plan (revised)",
      content: plan,
    },
  });
}

async function revisePlanForDecisions(
  runId: string,
  state: PlanDecisionsState,
): Promise<{ plan: string; thread: QaMessage[] }> {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { tasks: true, workspace: { include: { agents: true } } },
  });
  if (!run) throw new Error("Run not found");
  const plannerAgent = pickOne(run.workspace.agents, PLANNER_POSITIONS);
  const planTask = pickPlanTask(run.tasks);
  const currentPlan = planTask?.output ?? "";
  const thread = await getPlanThread(runId);

  if (!plannerAgent || !planTask || !picksDifferFromRecommended(state.items)) {
    const next = { ...state, appliedKey: decisionAnswersKey(state.items) };
    await saveDecisionState(runId, next);
    return { plan: currentPlan, thread };
  }

  const credential = await findProviderCredential(
    prisma,
    plannerAgent.workspaceId,
    plannerAgent.provider,
  );
  const config = resolveProviderConfig(
    plannerAgent.provider,
    plannerAgent.model,
    credential ?? undefined,
  );
  config.maxTokens = 2500;
  const llm = createProvider(config, plannerAgent.position, "Apply plan decisions");
  let reply = "";
  const result = await llm.stream(
    [
      {
        role: "system",
        content: `${plannerSystemPrompt(plannerAgent.name, plannerAgent.positionLabel)} You speak for the planning council. Apply the CEO's directional choices. Never refuse.`,
      },
      { role: "user", content: decisionApplyUserPrompt(currentPlan, state.items) },
    ],
    (chunk) => {
      reply += chunk.content;
    },
  );
  reply = reply || result.content;
  const updated = stripDecisionFence(extractUpdatedPlan(reply, currentPlan));
  thread.push({
    role: "assistant",
    speaker: "Workspace AI",
    content: "Updated the plan to match your direction choices.",
  });
  await savePlanThread(runId, thread);
  if (updated !== currentPlan) {
    await writeRevisedPlan(runId, planTask.id, updated);
  }
  const next = { ...state, appliedKey: decisionAnswersKey(state.items) };
  await saveDecisionState(runId, next);
  return { plan: updated, thread };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const session = await requireSession();
    const { runId } = await params;
    await assertRunAccess(runId, session);
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

  const decisions = await getDecisionState(runId);

  return NextResponse.json({
    status: run.status,
    ceoGoal: run.ceoGoal,
    plan: planTask?.output ?? "",
    planner: planTask?.position ?? null,
    published,
    thread,
    decisions: decisions.items,
  });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const session = await requireSession();
    const { runId } = await params;
    await assertRunAccess(runId, session);
    const limit = await consumeRateLimit({
      scope: "plan-mutation-user-run",
      identifier: `${session.id}:${runId}`,
      limit: 60,
      windowMs: 60 * 60_000,
    });
    if (!limit.allowed) return rateLimitResponse(limit);
  const parsed = planMutationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid plan request" }, { status: 400 });
  }
  const body = parsed.data;
  const { action } = body;

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
    const decisions = await getDecisionState(runId);
    if (!allDecisionsAnswered(decisions.items)) {
      return NextResponse.json(
        {
          error: "Pick an answer for each direction question, or use the recommended options.",
          decisions: decisions.items,
        },
        { status: 400 },
      );
    }
    if (decisionAnswersKey(decisions.items) !== decisions.appliedKey) {
      await revisePlanForDecisions(runId, decisions);
    }
    await publishAndDelegate(runId);
    runOrchestrator(runId).catch(console.error);
    return NextResponse.json({ ok: true });
  }

  if (action === "decide") {
    const run = await prisma.run.findUnique({
      where: { id: runId },
      include: { tasks: true },
    });
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (run.status !== "paused") {
      return NextResponse.json({ error: "Plan is not in review" }, { status: 400 });
    }
    let state = await getDecisionState(runId);
    if (state.items.length === 0) {
      return NextResponse.json({ error: "No direction questions on this plan" }, { status: 400 });
    }
    if (body.useRecommended) {
      state = { ...state, items: withRecommendedAnswers(state.items) };
    } else {
      const nextItems = applyAnswer(
        state.items,
        String(body.decisionId ?? ""),
        String(body.optionId ?? ""),
      );
      if (!nextItems) {
        return NextResponse.json({ error: "Unknown question or option" }, { status: 400 });
      }
      state = { ...state, items: nextItems };
    }
    await saveDecisionState(runId, state);
    const planTask = pickPlanTask(run.tasks);
    let plan = planTask?.output ?? "";
    let thread = await getPlanThread(runId);
    if (allDecisionsAnswered(state.items) && decisionAnswersKey(state.items) !== state.appliedKey) {
      const revised = await revisePlanForDecisions(runId, state);
      plan = revised.plan;
      thread = revised.thread;
      state = await getDecisionState(runId);
    }
    return NextResponse.json({
      ok: true,
      plan,
      thread,
      decisions: state.items,
    });
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

  const question = body.message;
  let thread = await getPlanThread(runId);
  if (thread.length === 0) {
    thread = councilThreadFromTasks(run.tasks.filter((t) => t.status === "done"));
  }
  thread.push({ role: "user", content: question });

  const credential = await findProviderCredential(
    prisma,
    plannerAgent.workspaceId,
    plannerAgent.provider,
  );
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

  const updated = stripDecisionFence(extractUpdatedPlan(reply, planTask.output ?? ""));
  if (updated !== planTask.output) {
    await writeRevisedPlan(runId, planTask.id, updated);
  }

  const decisions = await getDecisionState(runId);
  return NextResponse.json({ ok: true, plan: updated, thread, decisions: decisions.items });
  } catch (err) {
    return authErrorResponse(err);
  }
}

function extractUpdatedPlan(reply: string, previous: string): string {
  const marker = reply.match(/updated plan\s*[:\n]\s*([\s\S]+)/i);
  if (marker && marker[1].trim().length > 200) return marker[1].trim();
  if (reply.length > 400 && reply.length >= previous.length * 0.6) return reply;
  return previous;
}
