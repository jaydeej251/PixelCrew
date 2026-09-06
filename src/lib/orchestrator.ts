import type { Agent, Task } from "@prisma/client";
import { prisma } from "./db";
import { createProvider, resolveProviderConfig, estimateCost } from "./providers";
import type { AgentEventPayload } from "./events";
import { evalStayInRole } from "./evals";
import {
  buildWorkflowGraph,
  WORKFLOW_STAGES,
  DEFAULT_TOKEN_BUDGET,
  DEFAULT_MAX_CONCURRENT_LLM,
  DISPATCH_TITLE,
  COUNCIL_PRODUCT_TITLE,
  COUNCIL_SENIOR_TITLE,
  COUNCIL_UX_TITLE,
  SYNTHESIZE_TITLE,
  PLAN_DRAFT_TITLE,
  PLAN_PUBLISHED_TITLE,
  PLAN_QA_TITLE,
  PLAN_DECISIONS_TITLE,
  PRE_PUBLISH_STAGES,
  POST_PUBLISH_STAGES,
  pickPlanTask,
} from "./workflow";
import {
  looksLikeHandoffOrRefusal,
  looksTruncated,
  dispatcherSystemPrompt,
  councilSystemPrompt,
  synthesizerSystemPrompt,
  plannerSystemPrompt,
  workerSystemPrompt,
  parseNeededRoles,
  councilThreadFromTasks,
  STATIC_SHIP_BAR,
} from "./prompts";
import {
  hasUnclosedFence,
  leftoverProse,
  parseFileFences,
  scaffoldGaps,
} from "./project-files";
import { evalShippedProject, formatShipReport } from "./ship-quality";
import { evalPlanQuality, formatPlanReport } from "./plan-quality";
import {
  parsePlanDecisions,
  stripDecisionFence,
  type PlanDecision,
} from "./plan-decisions";
import {
  engineeringAssignment,
  ENGINEER_POSITIONS,
  engineersOnTeam,
  pickOne,
  qaOnTeam,
  REVIEWER_POSITIONS,
  DISPATCHER_POSITION,
} from "./roster";
import { ensureRole, isPositionKey } from "./hire";
import { configureAgentsForRun, getDefaultModel, workspaceHasProvider } from "./run-setup";
import { planningStageModelOverride } from "./stage-models";
import { findProviderCredential } from "./provider-credentials";
import type { PositionKey } from "./constants";
import {
  getOrCreateExecution,
  projectMilestone,
  settleAttempt,
  startOrResumeAttempt,
} from "./execution-runtime";

type EmitFn = (type: string, payload: AgentEventPayload) => Promise<void>;

class RunAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunAbortedError";
  }
}

class UserStoppedError extends Error {
  constructor() {
    super("Run stopped");
    this.name = "UserStoppedError";
  }
}

async function isRunLoopActive(runId: string, loopStartedAt: Date): Promise<boolean> {
  const live = await prisma.run.findUnique({
    where: { id: runId },
    select: { status: true, startedAt: true },
  });
  if (!live || live.status !== "running" || !live.startedAt) return false;
  return live.startedAt.getTime() === loopStartedAt.getTime();
}

async function assertLoopActive(runId: string, loopStartedAt: Date) {
  if (!(await isRunLoopActive(runId, loopStartedAt))) {
    throw new UserStoppedError();
  }
}

export async function emitRunEvent(
  runId: string,
  type: Parameters<typeof prisma.runEvent.create>[0]["data"]["type"],
  payload: AgentEventPayload,
  agentId?: string,
) {
  await prisma.runEvent.create({
    data: { runId, type, payload, agentId },
  });
}

export async function claimNextTask(
  runId: string,
  agent: Agent,
): Promise<Task | null> {
  return prisma.$transaction(async (tx) => {
    const candidates = await tx.task.findMany({
      where: {
        runId,
        position: agent.position,
        status: "queued",
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });

    for (const task of candidates) {
      if (task.dependsOnIds.length > 0) {
        const doneCount = await tx.task.count({
          where: { id: { in: task.dependsOnIds }, status: "done" },
        });
        if (doneCount < task.dependsOnIds.length) continue;
      }

      const claimed = await tx.task.updateMany({
        where: { id: task.id, status: "queued" },
        data: {
          status: "claimed",
          claimedById: agent.id,
          claimedAt: new Date(),
        },
      });
      if (claimed.count !== 1) continue;
      return tx.task.findUniqueOrThrow({ where: { id: task.id } });
    }

    return null;
  });
}

async function loadPriorContext(runId: string, task: Task): Promise<string> {
  if (task.dependsOnIds.length === 0) return "";
  const priors = await prisma.task.findMany({
    where: { runId, id: { in: task.dependsOnIds }, status: "done" },
    select: { title: true, output: true, position: true },
  });
  if (priors.length === 0) return "";
  return priors
    .map((p) => `### ${p.position}: ${p.title}\n${summarizeOutput(p.output ?? "")}`)
    .join("\n\n");
}

function summarizeOutput(output: string): string {
  const files = parseFileFences(output);
  if (files.length === 0) {
    // Council → synth digests stay tight; full dumps blow token budget.
    return output.slice(0, 1_400);
  }
  const listing = files.map((f) => `- ${f.path} (${f.content.length} chars)`).join("\n");
  const bodies = files.map((f) => `### ${f.path}\n${f.content.slice(0, 1_200)}`).join("\n\n");
  return `Files emitted:\n${listing}\n\n${bodies}`.slice(0, 7_000);
}

function planningKind(title: string): "dispatch" | "council" | "synth" | "legacy" | null {
  if (title === DISPATCH_TITLE) return "dispatch";
  if (
    title === COUNCIL_PRODUCT_TITLE ||
    title === COUNCIL_SENIOR_TITLE ||
    title === COUNCIL_UX_TITLE
  ) {
    return "council";
  }
  if (title === SYNTHESIZE_TITLE) return "synth";
  if (title === PLAN_DRAFT_TITLE) return "legacy";
  return null;
}

export async function executeAgentTask(
  runId: string,
  agent: Agent,
  task: Task,
  emit: EmitFn,
  organizationId: string,
  loopStartedAt: Date,
) {
  await prisma.agent.update({
    where: { id: agent.id },
    data: { status: "working" },
  });
  await prisma.task.update({
    where: { id: task.id },
    data: { status: "in_progress" },
  });
  await assertLoopActive(runId, loopStartedAt);

  await emit("TASK_CLAIMED", {
    agentId: agent.id,
    agentName: agent.name,
    position: agent.position,
    taskId: task.id,
    taskTitle: task.title,
  });

  const credential = await findProviderCredential(
    prisma,
    agent.workspaceId,
    agent.provider,
  );

  const kind = planningKind(task.title);
  const stageModel = planningStageModelOverride(agent.provider, agent.model, kind);
  const config = resolveProviderConfig(
    agent.provider,
    stageModel ?? agent.model,
    credential ?? undefined,
  );

  const isEngineer = ENGINEER_POSITIONS.includes(
    agent.position as (typeof ENGINEER_POSITIONS)[number],
  );
  if (kind === "dispatch" || kind === "synth" || kind === "legacy") config.maxTokens = 2200;
  else if (kind === "council") config.maxTokens = 1200;
  else if (isEngineer) config.maxTokens = 4000;
  else if (agent.position === "qa_engineer") config.maxTokens = 2200;
  else config.maxTokens = 1500;

  if (config.provider !== "mock" && config.provider !== "ollama") {
    const masked = config.apiKey
      ? `${config.apiKey.slice(0, 6)}…${config.apiKey.slice(-4)}`
      : "(none)";
    const stageNote = stageModel ? ` (run model was ${agent.model})` : "";
    console.log(
      `[PixelCrew] ${agent.name} → ${config.provider}/${config.model}${stageNote} key=${masked}`,
    );
  }

  const runMeta = await prisma.run.findUnique({
    where: { id: runId },
    select: { ceoGoal: true },
  });
  const ceoGoal = runMeta?.ceoGoal ?? "";
  const provider = createProvider(config, agent.position, task.title, ceoGoal);
  const prior = await loadPriorContext(runId, task);
  let shipContext = "";
  if (agent.position === "qa_engineer") {
    const codeFiles = await prisma.artifact.findMany({
      where: { runId, type: "code" },
      select: { filePath: true, content: true },
    });
    shipContext = formatShipReport(
      evalShippedProject(
        codeFiles
          .filter((a) => a.filePath)
          .map((a) => ({ path: a.filePath!, content: a.content })),
        { ceoGoal },
      ),
    );
  }

  const systemPrompt =
    kind === "dispatch"
      ? dispatcherSystemPrompt(agent.name)
      : kind === "council"
        ? councilSystemPrompt(agent.name, agent.positionLabel, agent.position)
        : kind === "synth"
          ? synthesizerSystemPrompt(agent.name)
          : kind === "legacy"
            ? plannerSystemPrompt(agent.name, agent.positionLabel)
            : workerSystemPrompt(
                agent.name,
                agent.positionLabel,
                agent.jobBoundary,
                agent.position,
              );

  const goalAlreadyInDescription =
    Boolean(task.description) &&
    ceoGoal.length > 0 &&
    task.description!.includes(ceoGoal);
  const userPrompt = kind
    ? [
        task.description ?? "",
        prior ? `Council / upstream work:\n${prior}` : "",
        goalAlreadyInDescription
          ? ""
          : `CEO source of truth (never replace this with a template):\n${ceoGoal}`,
        "Do the work. Do not refuse or hand this off.",
      ]
        .filter(Boolean)
        .join("\n\n")
    : [
        `CEO source of truth (acceptance criteria):\n${ceoGoal}`,
        prior ? `CEO context and upstream work:\n${prior}` : "",
        `Your task: ${task.title}\n${task.description ?? ""}`,
        shipContext,
      ]
        .filter(Boolean)
        .join("\n\n");

  await emit("TASK_STARTED", {
    agentId: agent.id,
    agentName: agent.name,
    position: agent.position,
    taskId: task.id,
    taskTitle: task.title,
    brief: userPrompt.slice(0, 12_000),
  });

  const execution = await getOrCreateExecution(prisma, {
    runId,
    taskId: task.id,
    agentId: agent.id,
  });
  const claimStamp = task.claimedAt?.toISOString() ?? loopStartedAt.toISOString();
  const attempt = await startOrResumeAttempt(prisma, {
    executionId: execution.id,
    requestId: `${task.id}:${claimStamp}:${agent.id}`,
    agentId: agent.id,
  });
  await projectMilestone(prisma, {
    runId,
    agentId: agent.id,
    type: "EXECUTION_STARTED",
    sourceKind: "execution",
    sourceId: execution.id,
    payload: {
      executionId: execution.id,
      attemptId: attempt.id,
      taskId: task.id,
      taskTitle: task.title,
      agentId: agent.id,
      agentName: agent.name,
      status: "running",
      sequence: attempt.sequence,
    },
  });

  try {
  let fullOutput = "";
  let thinkBuf = "";
  const flushThinking = async (force = false) => {
    if (!thinkBuf) return;
    if (!force && thinkBuf.length < 80 && !thinkBuf.includes("\n")) return;
    const message = thinkBuf;
    thinkBuf = "";
    await emit("AGENT_THINKING", {
      agentId: agent.id,
      agentName: agent.name,
      message,
      taskId: task.id,
    });
  };
  const onChunk = async (chunk: { content?: string }) => {
    if (!chunk.content) return;
    fullOutput += chunk.content;
    thinkBuf += chunk.content;
    await flushThinking(false);
  };
  let result = await provider.stream(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    onChunk,
  );
  fullOutput = fullOutput || result.content;
  await flushThinking(true);

  if (kind && looksLikeHandoffOrRefusal(fullOutput)) {
    fullOutput = "";
    thinkBuf = "";
    result = await provider.stream(
      [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `${userPrompt}\n\nYour previous reply was a refusal. That is not allowed. Write the useful work now.`,
        },
      ],
      onChunk,
    );
    fullOutput = fullOutput || result.content;
    await flushThinking(true);
  }

  if (
    (kind || isEngineer) &&
    (result.finishReason === "length" ||
      looksTruncated(fullOutput) ||
      hasUnclosedFence(fullOutput))
  ) {
    result = await provider.stream(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
        { role: "assistant", content: fullOutput },
        {
          role: "user",
          content:
            "You were cut off. Continue exactly from the last word. Do not restart. Finish every remaining section.",
        },
      ],
      onChunk,
    );
    await flushThinking(true);
  }

  if (isEngineer) {
    const firstFiles = parseFileFences(fullOutput);
    const ship = evalShippedProject(firstFiles, { role: agent.position, ceoGoal });
    if (!ship.passed) {
      const previous = fullOutput;
      fullOutput = "";
      thinkBuf = "";
      result = await provider.stream(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
          { role: "assistant", content: previous },
          {
            role: "user",
            content: `${formatShipReport(ship)}\n\nRewrite the files and fix every FAIL. Emit complete \`\`\`file:path fences. Build the CEO's product (not a PixelCrew portfolio). No placeholder copy, no missing image src, no secrets. Static HTML/CSS/JS only.`,
          },
        ],
        onChunk,
      );
      fullOutput = fullOutput || result.content;
      await flushThinking(true);
      if (parseFileFences(fullOutput).length === 0) fullOutput = previous;
      const rewritten = evalShippedProject(parseFileFences(fullOutput), {
        role: agent.position,
        ceoGoal,
      });
      if (!rewritten.passed) {
        throw new RunAbortedError(
          `Engineering output still failed acceptance after rewrite.\n${formatShipReport(rewritten)}`,
        );
      }
    }
  }

  let pendingDecisions: PlanDecision[] = [];
  if (kind === "synth" || kind === "legacy") {
    const firstDecisions = parsePlanDecisions(fullOutput);
    const quality = evalPlanQuality(stripDecisionFence(fullOutput), { ceoGoal });
    if (!quality.passed) {
      const previous = fullOutput;
      fullOutput = "";
      thinkBuf = "";
      result = await provider.stream(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
          { role: "assistant", content: previous },
          {
            role: "user",
            content: `${formatPlanReport(quality)}\n\nRewrite the combined plan and fix every FAIL. Keep Goal, stack, UX, features, out of scope, and a role-correct task list. Static HTML/CSS/JS. Size the timeline to hours for a one-pager — Engineer builds the files, not Product. Keep any decisions json fence at the end.`,
          },
        ],
        onChunk,
      );
      fullOutput = fullOutput || result.content;
      await flushThinking(true);
      if (!fullOutput.trim()) fullOutput = previous;
      const rewritten = evalPlanQuality(stripDecisionFence(fullOutput), { ceoGoal });
      if (!rewritten.passed) {
        throw new RunAbortedError(
          `Combined plan still drifted from the CEO goal after rewrite.\n${formatPlanReport(rewritten)}`,
        );
      }
    }
    pendingDecisions = parsePlanDecisions(fullOutput);
    if (pendingDecisions.length === 0) pendingDecisions = firstDecisions;
    fullOutput = stripDecisionFence(fullOutput);
  }

  await assertLoopActive(runId, loopStartedAt);

  const handoffMatch = !kind ? fullOutput.match(/HANDOFF:\s*(\w+)/i) : null;
  if (handoffMatch) {
    const targetPosition = handoffMatch[1].toLowerCase();
    const teammate = await prisma.agent.findFirst({
      where: { workspaceId: agent.workspaceId, position: targetPosition },
    });
    if (teammate) {
      await emit("AGENT_HANDOFF", {
        agentId: agent.id,
        agentName: agent.name,
        targetPosition,
        taskId: task.id,
        message: fullOutput,
      });
      await prisma.task.update({
        where: { id: task.id },
        data: { status: "queued", claimedById: null, position: targetPosition },
      });
      await prisma.agent.update({ where: { id: agent.id }, data: { status: "idle" } });
      await settleAttempt(prisma, attempt.id, "failed", "Reassigned via handoff");
      return;
    }
  }

  await prisma.task.update({
    where: { id: task.id },
    data: { status: "done", output: fullOutput, completedAt: new Date() },
  });
  await prisma.agent.update({ where: { id: agent.id }, data: { status: "idle" } });

  if (pendingDecisions.length > 0) {
    await persistPlanDecisions(runId, pendingDecisions);
  }

  await emit("AGENT_TASK_DONE", {
    agentId: agent.id,
    agentName: agent.name,
    taskId: task.id,
    taskTitle: task.title,
    message: `Finished “${task.title}”`,
  });

  const inputTokens = result.inputTokens ?? 0;
  const outputTokens = result.outputTokens ?? 0;
  const estCost = estimateCost(agent.provider, agent.model, inputTokens, outputTokens);

  await prisma.usageEvent.create({
    data: {
      organizationId,
      runId,
      provider: agent.provider,
      model: agent.model,
      inputTokens,
      outputTokens,
      estCostUsd: estCost,
    },
  });

  await prisma.run.update({
    where: { id: runId },
    data: {
      totalTokens: { increment: inputTokens + outputTokens },
      estCostUsd: { increment: estCost },
    },
  });

  await prisma.agentMemory.create({
    data: {
      agentId: agent.id,
      runId,
      content: fullOutput.slice(0, 12_000),
    },
  });

  const artifactType = mapPositionToArtifact(agent.position);
  const files = parseFileFences(fullOutput);
  if (files.length > 0) {
    await persistProjectFiles(runId, files);
    const notes = leftoverProse(fullOutput, files);
    if (notes.length > 40) {
      await prisma.artifact.create({
        data: {
          runId,
          type: artifactType ?? "other",
          title: `${agent.positionLabel}: notes`,
          content: notes,
          filePath: `${agent.position}/${task.id}-notes.md`,
        },
      });
    }
  } else if (artifactType) {
    const evalResult = evalStayInRole(fullOutput, agent.position);
    if (!evalResult.passed) {
      await emit("AGENT_BLOCKED", {
        agentId: agent.id,
        agentName: agent.name,
        message: evalResult.reason,
        taskId: task.id,
      });
    }
    await prisma.artifact.create({
      data: {
        runId,
        type: artifactType,
        title: `${agent.positionLabel}: ${task.title}`,
        content: fullOutput,
        filePath: `${agent.position}/${task.id}.md`,
      },
    });
  }

  const settled = await settleAttempt(prisma, attempt.id, "completed");
  if (settled?.status === "completed") {
    await projectMilestone(prisma, {
      runId,
      agentId: agent.id,
      type: "EXECUTION_COMPLETED",
      sourceKind: "execution",
      sourceId: execution.id,
      payload: {
        executionId: execution.id,
        attemptId: attempt.id,
        taskId: task.id,
        taskTitle: task.title,
        agentId: agent.id,
        agentName: agent.name,
        status: "completed",
        sequence: attempt.sequence,
      },
    });
  }
  } catch (err) {
    await settleAttempt(prisma, attempt.id, "failed", err);
    throw err;
  }
}

async function persistProjectFiles(
  runId: string,
  files: Array<{ path: string; content: string }>,
) {
  for (const file of files) {
    const existing = await prisma.artifact.findFirst({
      where: { runId, filePath: file.path },
    });
    if (existing) {
      await prisma.artifact.update({
        where: { id: existing.id },
        data: { content: file.content, title: file.path, type: "code" },
      });
    } else {
      await prisma.artifact.create({
        data: {
          runId,
          type: "code",
          title: file.path,
          content: file.content,
          filePath: file.path,
        },
      });
    }
  }
}

async function persistScaffoldFiles(runId: string, ceoGoal: string) {
  const artifacts = await prisma.artifact.findMany({ where: { runId } });
  await persistProjectFiles(runId, scaffoldGaps({ ceoGoal, artifacts }));
}

function mapPositionToArtifact(position: string) {
  const map: Record<string, "prd" | "architecture" | "code" | "test_plan" | "other"> = {
    dispatcher: "other",
    project_manager: "prd",
    executive: "prd",
    tech_architect: "architecture",
    engineer: "code",
    frontend_engineer: "code",
    backend_engineer: "code",
    qa_engineer: "test_plan",
    designer: "other",
  };
  return map[position] ?? "other";
}

function isCreditOrAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("not enough credits") ||
    msg.includes("more credits") ||
    msg.includes("invalid API key") ||
    msg.includes("Authentication")
  );
}

async function refreshGraph(runId: string) {
  const tasks = await prisma.task.findMany({ where: { runId } });
  await prisma.workflow.upsert({
    where: { runId },
    create: { runId, graph: buildWorkflowGraph(tasks) },
    update: { graph: buildWorkflowGraph(tasks) },
  });
}

const DEFAULT_COUNCIL: PositionKey[] = [
  "project_manager",
  "tech_architect",
  "designer",
  "engineer",
];

async function staffRoles(
  workspaceId: string,
  needed: PositionKey[],
  emit: EmitFn,
  provider: Agent["provider"],
  model: string,
) {
  const unique = [...new Set(needed)];
  for (const position of unique) {
    if (!isPositionKey(position)) continue;
    const { agent, created } = await ensureRole({
      workspaceId,
      position,
      provider,
      model,
    });
    if (created) {
      // TASK_CLAIMED → walking so the floor can spawn them at the front door.
      await emit("TASK_CLAIMED", {
        agentId: agent.id,
        agentName: agent.name,
        position: agent.position,
        message: `Hired ${agent.name} as ${agent.positionLabel}`,
        taskTitle: "Hiring",
      });
    }
  }
  await configureAgentsForRun(workspaceId, provider, model);
}

async function seedDispatchTask(runId: string, ceoGoal: string) {
  const exists = await prisma.task.findFirst({ where: { runId, title: DISPATCH_TITLE } });
  if (exists) return exists;
  const task = await prisma.task.create({
    data: {
      runId,
      title: DISPATCH_TITLE,
      description: `CEO goal:\n${ceoGoal}\n\nStaff Product, Senior Developer, and UI/UX. Write a brief the CEO can understand.`,
      position: DISPATCHER_POSITION,
      priority: 100,
    },
  });
  await refreshGraph(runId);
  return task;
}

async function seedCouncilTasks(runId: string, ceoGoal: string, dispatchTaskId: string) {
  const specs = [
    {
      title: COUNCIL_PRODUCT_TITLE,
      position: "project_manager",
      description: `Product brainstorm. Partner with Senior Dev and UI/UX. Goal:\n${ceoGoal}`,
    },
    {
      title: COUNCIL_SENIOR_TITLE,
      position: "tech_architect",
      description: `Senior-dev brainstorm (stack + architecture). Partner with Product and UI/UX. Goal:\n${ceoGoal}`,
    },
    {
      title: COUNCIL_UX_TITLE,
      position: "designer",
      description: `UI/UX brainstorm (screens + flow). Partner with Product and Senior Dev. Goal:\n${ceoGoal}`,
    },
  ] as const;

  for (const spec of specs) {
    const exists = await prisma.task.findFirst({ where: { runId, title: spec.title } });
    if (exists) continue;
    await prisma.task.create({
      data: {
        runId,
        title: spec.title,
        description: spec.description,
        position: spec.position,
        priority: 90,
        dependsOnIds: [dispatchTaskId],
      },
    });
  }
  await refreshGraph(runId);
}

async function seedSynthesizeTask(runId: string, ceoGoal: string, councilIds: string[]) {
  const exists = await prisma.task.findFirst({ where: { runId, title: SYNTHESIZE_TITLE } });
  if (exists) return;
  await prisma.task.create({
    data: {
      runId,
      title: SYNTHESIZE_TITLE,
      description: `Merge the council brainstorms into one plan the CEO can publish. Goal:\n${ceoGoal}`,
      position: DISPATCHER_POSITION,
      priority: 80,
      dependsOnIds: councilIds,
    },
  });
  await refreshGraph(runId);
}

async function persistPlanDecisions(runId: string, items: PlanDecision[]) {
  const existing = await prisma.artifact.findFirst({
    where: { runId, title: PLAN_DECISIONS_TITLE },
  });
  if (existing) return;
  await prisma.artifact.create({
    data: {
      runId,
      type: "other",
      title: PLAN_DECISIONS_TITLE,
      content: JSON.stringify({ items }),
    },
  });
}

async function seedPlanQaThread(runId: string) {
  const existing = await prisma.artifact.findFirst({
    where: { runId, title: PLAN_QA_TITLE },
  });
  if (existing) return;

  const tasks = await prisma.task.findMany({
    where: { runId, status: "done" },
    orderBy: { completedAt: "asc" },
  });
  const messages = councilThreadFromTasks(tasks);
  if (messages.length === 0) return;

  await prisma.artifact.create({
    data: {
      runId,
      type: "other",
      title: PLAN_QA_TITLE,
      content: JSON.stringify(messages),
    },
  });
}

export async function publishAndDelegate(runId: string) {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: {
      workspace: { include: { agents: true } },
      tasks: true,
      artifacts: true,
    },
  });
  if (!run) throw new Error("Run not found");

  const already = run.artifacts.find((a) => a.title === PLAN_PUBLISHED_TITLE);
  if (already) {
    await prisma.run.update({ where: { id: runId }, data: { status: "running" } });
    return;
  }

  const planTask = pickPlanTask(run.tasks);
  const planText =
    planTask?.output || run.artifacts.find((a) => a.type === "prd")?.content || "";
  if (!planText.trim()) {
    throw new Error("No combined plan to publish");
  }
  const publishQuality = evalPlanQuality(planText, { ceoGoal: run.ceoGoal });
  if (!publishQuality.passed) {
    throw new Error(
      `This plan no longer matches the CEO goal and cannot be published.\n${formatPlanReport(publishQuality)}`,
    );
  }
  let agents = run.workspace.agents;
  const sample = agents[0];
  const reviewer = pickOne(agents, REVIEWER_POSITIONS);
  let assignment = engineeringAssignment(agents);

  if (assignment.mode === "none") {
    await ensureRole({
      workspaceId: run.workspaceId,
      position: "engineer",
      provider: sample?.provider ?? "mock",
      model: sample?.model ?? "mock",
    });
    if (sample) {
      await configureAgentsForRun(run.workspaceId, sample.provider, sample.model);
    }
    agents = await prisma.agent.findMany({ where: { workspaceId: run.workspaceId } });
    assignment = engineeringAssignment(agents);
  }

  await prisma.artifact.create({
    data: {
      runId,
      type: "other",
      title: PLAN_PUBLISHED_TITLE,
      content: `Published by CEO.\nRoster: ${agents.map((a) => `${a.name} (${a.position})`).join(", ")}`,
    },
  });

  const reviewTask = reviewer
    ? await prisma.task.create({
        data: {
          runId,
          title: "Review published plan and delegate",
          description: `The CEO goal is the source of truth:\n${run.ceoGoal}\n\nThe CEO published this plan. Review it without changing the product. Engineering capacity: ${assignment.positions.join(", ") || "none"}.\n\nPlan:\n${planText.slice(0, 4000)}`,
          position: reviewer.position,
          priority: 90,
          dependsOnIds: planTask ? [planTask.id] : [],
        },
      })
    : null;

  const dependsOn = reviewTask ? [reviewTask.id] : planTask ? [planTask.id] : [];
  const buildIds: string[] = [];

  if (assignment.mode === "none") {
    await prisma.task.create({
      data: {
        runId,
        title: "Blocked: no engineer on the team",
        description: "Hire an Engineer (or FE/BE) and start a new run.",
        position: reviewer?.position ?? planTask?.position ?? "project_manager",
        priority: 10,
        dependsOnIds: dependsOn,
        status: "blocked",
      },
    });
  } else if (assignment.mode === "split") {
    const fe = await prisma.task.create({
      data: {
        runId,
        title: "Implement frontend from the plan",
        description:
          `CEO source of truth:\n${run.ceoGoal}\n\nEmit a complete demo UI (index.html, CSS, JS) using \`\`\`file:path fences. Implement every named screen, control, state, formula, and visual constraint. Specific copy from the CEO goal — not John Doe / Project One. CSS or inline SVG for visuals (no missing assets). Do not overwrite data.js.\n${STATIC_SHIP_BAR}`,
        position: "frontend_engineer",
        priority: 80,
        dependsOnIds: dependsOn,
      },
    });
    const be = await prisma.task.create({
      data: {
        runId,
        title: "Implement backend from the plan",
        description:
          `CEO source of truth:\n${run.ceoGoal}\n\nEmit data.js helpers only for persistence requested by the CEO goal, using localStorage and \`\`\`file:path fences. Collections are JSON arrays (parse, push, save). Do not invent contact-message storage. Do not emit Express/Mongo/Nodemailer/reCAPTCHA. Do not overwrite index.html.`,
        position: "backend_engineer",
        priority: 80,
        dependsOnIds: dependsOn,
      },
    });
    buildIds.push(fe.id, be.id);
  } else {
    const pos = assignment.soloPosition!;
    const work = await prisma.task.create({
      data: {
        runId,
        title: "Implement product work from the plan",
        description: `CEO source of truth:\n${run.ceoGoal}\n\nYou are the only engineering capacity (${pos}). Emit a complete runnable static app (index.html + CSS + JS) using \`\`\`file:path fences. Implement every named screen, control, state, formula, and visual constraint. Specific copy from the CEO goal, CSS/SVG visuals — no missing images, no John Doe placeholders.\n${STATIC_SHIP_BAR}`,
        position: pos,
        priority: 80,
        dependsOnIds: dependsOn,
      },
    });
    buildIds.push(work.id);
  }

  if (qaOnTeam(agents).length > 0 && buildIds.length > 0) {
    await prisma.task.create({
      data: {
        runId,
        title: "QA the delegated work",
        description:
          `CEO source of truth:\n${run.ceoGoal}\n\nReview the actual emitted files against every acceptance criterion in that goal. Verdict FAIL or PASS, then a punch list. Fail wrong product type/name, missing screens or controls, invented template sections, inline JS, localStorage overwrites, hidden forms, and unsafe external links. Do not invent passing results. Do not rewrite the product.`,
        position: "qa_engineer",
        priority: 40,
        dependsOnIds: buildIds,
      },
    });
  }

  const tasks = await prisma.task.findMany({ where: { runId } });
  await prisma.workflow.upsert({
    where: { runId },
    create: { runId, graph: buildWorkflowGraph(tasks) },
    update: { graph: buildWorkflowGraph(tasks) },
  });

  await prisma.run.update({ where: { id: runId }, data: { status: "running" } });
}

export async function runOrchestrator(runId: string) {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: {
      workspace: { include: { organization: true, agents: true } },
      tasks: true,
    },
  });
  if (!run) throw new Error("Run not found");

  const emit: EmitFn = async (type, payload) => {
    await emitRunEvent(
      runId,
      type as Parameters<typeof emitRunEvent>[1],
      payload,
      payload.agentId,
    );
  };

  const started = await prisma.run.update({
    where: { id: runId },
    data: { status: "running", startedAt: new Date(), completedAt: null },
    select: { startedAt: true },
  });
  const loopStartedAt = started.startedAt ?? new Date();

  const cap = Math.min(
    run.workspace.concurrencyCap || DEFAULT_MAX_CONCURRENT_LLM,
    DEFAULT_MAX_CONCURRENT_LLM,
  );
  const orgId = run.workspace.organizationId;
  const loadRoster = () =>
    prisma.agent.findMany({ where: { workspaceId: run.workspaceId } });
  let agents = await loadRoster();
  const sample = agents[0];
  let llmProvider = sample?.provider ?? "mock";
  let llmModel = sample?.model ?? "mock";
  if (!sample) {
    const or = await workspaceHasProvider(run.workspaceId, "openrouter");
    if (or.ready) {
      llmProvider = "openrouter";
      llmModel = getDefaultModel("openrouter");
    }
  }

  await staffRoles(
    run.workspaceId,
    ["dispatcher", ...DEFAULT_COUNCIL],
    emit,
    llmProvider,
    llmModel,
  );
  agents = await loadRoster();

  const published = await prisma.artifact.findFirst({
    where: { runId, title: PLAN_PUBLISHED_TITLE },
  });

  if (run.tasks.length === 0) {
    await seedDispatchTask(runId, run.ceoGoal);
  }

  let abortReason: string | null = null;

  for (const stage of WORKFLOW_STAGES) {
    if (PRE_PUBLISH_STAGES.has(stage.id) && published) continue;
    if (POST_PUBLISH_STAGES.has(stage.id) && !published) continue;

    agents = await loadRoster();

    if (!(await isRunLoopActive(runId, loopStartedAt))) return;

    const stageTasks = await prisma.task.findMany({
      where: { runId, position: { in: stage.positions } },
    });
    if (stageTasks.length === 0) continue;

    const stageAgents = agents.filter((a) => stage.positions.includes(a.position));
    if (stageAgents.length === 0) continue;

    const stageCap = Math.min(
      cap,
      stage.maxParallel,
      stage.id === "build" ? Math.max(1, engineersOnTeam(agents).length) : stage.maxParallel,
    );

    await emit("TASK_STARTED", {
      message: `Stage: ${stage.label}`,
      taskTitle: stage.label,
    });
    console.log(`[PixelCrew] Stage ${stage.label} — max ${stageCap} parallel`);

    const inFlight = new Set<string>();

    const waitForIdle = async () => {
      while (inFlight.size > 0) {
        await new Promise((r) => setTimeout(r, 200));
      }
    };

    const tryClaim = async (agent: Agent) => {
      if (abortReason) return;
      if (inFlight.has(agent.id) || inFlight.size >= stageCap) return;
      const task = await claimNextTask(runId, agent);
      if (!task) return;

      inFlight.add(agent.id);
      try {
        if (!(await isRunLoopActive(runId, loopStartedAt))) {
          await prisma.task.update({
            where: { id: task.id },
            data: { status: "queued", claimedById: null, claimedAt: null },
          });
          await prisma.agent.update({
            where: { id: agent.id },
            data: { status: "idle" },
          });
          return;
        }
        const usage = await prisma.run.findUnique({
          where: { id: runId },
          select: { totalTokens: true },
        });
        if ((usage?.totalTokens ?? 0) >= DEFAULT_TOKEN_BUDGET) {
          throw new RunAbortedError(
            `Token budget reached (${DEFAULT_TOKEN_BUDGET}). Remaining work was not started.`,
          );
        }
        await executeAgentTask(runId, agent, task, emit, orgId, loopStartedAt);
      } catch (err) {
        if (err instanceof UserStoppedError) {
          await prisma.task.update({
            where: { id: task.id },
            data: { status: "queued", claimedById: null, claimedAt: null },
          });
          await prisma.agent.update({
            where: { id: agent.id },
            data: { status: "idle" },
          });
          return;
        }
        const message = err instanceof Error ? err.message : "Unknown error";
        await emit("AGENT_ERROR", {
          agentId: agent.id,
          agentName: agent.name,
          message,
        });
        await prisma.task.update({
          where: { id: task.id },
          data: { status: "failed" },
        });
        await prisma.agent.update({
          where: { id: agent.id },
          data: { status: "error" },
        });
        if (err instanceof RunAbortedError || isCreditOrAuthError(err)) {
          abortReason = message;
        }
      } finally {
        inFlight.delete(agent.id);
      }
    };

    let idleRounds = 0;
    while (!abortReason) {
      if (!(await isRunLoopActive(runId, loopStartedAt))) break;

      const remaining = await prisma.task.count({
        where: {
          runId,
          position: { in: stage.positions },
          status: { in: ["queued", "claimed", "in_progress"] },
        },
      });
      if (remaining === 0 && inFlight.size === 0) break;

      await Promise.all(stageAgents.map((a) => tryClaim(a)));

      if (inFlight.size === 0) {
        idleRounds++;
        if (idleRounds > 8) break;
      } else {
        idleRounds = 0;
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    await waitForIdle();
    if (!(await isRunLoopActive(runId, loopStartedAt))) return;
    if (abortReason) break;

    if (stage.id === "dispatch" && !published) {
      const dispatchTask = await prisma.task.findFirst({
        where: { runId, title: DISPATCH_TITLE, status: "done" },
      });
      const needed = parseNeededRoles(dispatchTask?.output ?? "", DEFAULT_COUNCIL);
      await staffRoles(
        run.workspaceId,
        [...DEFAULT_COUNCIL, ...needed],
        emit,
        llmProvider,
        llmModel,
      );
      if (dispatchTask) {
        await seedCouncilTasks(runId, run.ceoGoal, dispatchTask.id);
      }
    }

    if (stage.id === "council" && !published) {
      const council = await prisma.task.findMany({
        where: {
          runId,
          status: "done",
          title: { in: [COUNCIL_PRODUCT_TITLE, COUNCIL_SENIOR_TITLE, COUNCIL_UX_TITLE] },
        },
      });
      const ids = council.map((t) => t.id);
      if (ids.length > 0) {
        await seedSynthesizeTask(runId, run.ceoGoal, ids);
      }
    }

    if (stage.id === "synthesize" && !published) {
      const merged = await prisma.task.findFirst({
        where: { runId, title: SYNTHESIZE_TITLE, status: "done" },
      });
      if (!merged?.output?.trim()) {
        abortReason = "Planning council did not produce a combined plan.";
        break;
      }
      await emitRunEvent(runId, "TASK_STARTED", {
        message: "Council plan ready — confirm direction, then publish",
        taskTitle: "Plan review",
      });
      await seedPlanQaThread(runId);
      if (!(await isRunLoopActive(runId, loopStartedAt))) return;
      await prisma.run.update({
        where: { id: runId },
        data: { status: "paused" },
      });
      return;
    }
  }

  if (!(await isRunLoopActive(runId, loopStartedAt))) return;

  const remaining = await prisma.task.count({
    where: { runId, status: { not: "done" } },
  });

  if (abortReason) {
    await emitRunEvent(runId, "RUN_CANCELLED", { message: abortReason });
    await prisma.run.update({
      where: { id: runId },
      data: { status: "failed", completedAt: new Date() },
    });
    return;
  }

  if (remaining === 0) {
    await persistScaffoldFiles(runId, run.ceoGoal);
    await emitRunEvent(runId, "RUN_COMPLETED", { message: "Pipeline complete — project ready to preview or unzip" });
    await prisma.run.update({
      where: { id: runId },
      data: { status: "completed", completedAt: new Date() },
    });
  } else {
    await prisma.run.update({
      where: { id: runId },
      data: { status: "failed", completedAt: new Date() },
    });
  }
}
