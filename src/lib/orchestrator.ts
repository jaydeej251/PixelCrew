import type { Agent, Task } from "@prisma/client";
import { prisma } from "./db";
import { createProvider, resolveProviderConfig, estimateCost } from "./providers";
import type { AgentEventPayload } from "./events";
import { evalStayInRole } from "./evals";
import { buildWorkflowGraph } from "./workflow";

type EmitFn = (type: string, payload: AgentEventPayload) => Promise<void>;

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
    const task = await tx.task.findFirst({
      where: {
        runId,
        position: agent.position,
        status: "queued",
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });
    if (!task) return null;

    const deps = task.dependsOnIds;
    if (deps.length > 0) {
      const doneCount = await tx.task.count({
        where: { id: { in: deps }, status: "done" },
      });
      if (doneCount < deps.length) return null;
    }

    return tx.task.update({
      where: { id: task.id },
      data: {
        status: "claimed",
        claimedById: agent.id,
        claimedAt: new Date(),
      },
    });
  });
}

export async function executeAgentTask(
  runId: string,
  agent: Agent,
  task: Task,
  emit: EmitFn,
  organizationId: string,
) {
  await prisma.agent.update({
    where: { id: agent.id },
    data: { status: "working" },
  });
  await prisma.task.update({
    where: { id: task.id },
    data: { status: "in_progress" },
  });

  await emit("TASK_CLAIMED", {
    agentId: agent.id,
    agentName: agent.name,
    position: agent.position,
    taskId: task.id,
    taskTitle: task.title,
  });

  await emit("TASK_STARTED", {
    agentId: agent.id,
    agentName: agent.name,
    position: agent.position,
    taskId: task.id,
    taskTitle: task.title,
  });

  const credential = await prisma.providerCredential.findFirst({
    where: { workspaceId: agent.workspaceId, provider: agent.provider },
  });

  const config = resolveProviderConfig(
    agent.provider,
    agent.model,
    credential ?? undefined,
  );
  const provider = createProvider(config, agent.position, task.title);

  const systemPrompt = `You are ${agent.name}, a ${agent.positionLabel}.
Your job boundary: ${agent.jobBoundary}
If work is outside your boundary, say HANDOFF:<position> and explain why.
Current task: ${task.title}
${task.description ?? ""}`;

  let fullOutput = "";
  const result = await provider.stream(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Complete this task: ${task.title}` },
    ],
    async (chunk) => {
      if (chunk.content) {
        fullOutput += chunk.content;
        await emit("AGENT_THINKING", {
          agentId: agent.id,
          agentName: agent.name,
          message: chunk.content,
          taskId: task.id,
        });
      }
    },
  );

  const handoffMatch = fullOutput.match(/HANDOFF:(\w+)/i);
  if (handoffMatch) {
    const targetPosition = handoffMatch[1].toLowerCase();
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
    return;
  }

  await prisma.task.update({
    where: { id: task.id },
    data: { status: "done", output: fullOutput, completedAt: new Date() },
  });
  await prisma.agent.update({ where: { id: agent.id }, data: { status: "idle" } });

  await emit("AGENT_TASK_DONE", {
    agentId: agent.id,
    agentName: agent.name,
    taskId: task.id,
    message: fullOutput.slice(0, 200),
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

  const artifactType = mapPositionToArtifact(agent.position);
  if (artifactType) {
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
}

function mapPositionToArtifact(position: string) {
  const map: Record<string, "prd" | "architecture" | "code" | "test_plan" | "other"> = {
    project_manager: "prd",
    tech_architect: "architecture",
    frontend_engineer: "code",
    backend_engineer: "code",
    qa_engineer: "test_plan",
    designer: "other",
  };
  return map[position] ?? "other";
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

  await prisma.run.update({
    where: { id: runId },
    data: { status: "running", startedAt: new Date() },
  });

  const cap = run.workspace.concurrencyCap;
  const agents = run.workspace.agents;
  const orgId = run.workspace.organizationId;

  let active = 0;
  const running = new Set<string>();

  const tryClaim = async (agent: Agent) => {
    if (running.has(agent.id) || active >= cap) return;
    const task = await claimNextTask(runId, agent);
    if (!task) return;

    running.add(agent.id);
    active++;
    try {
      await executeAgentTask(runId, agent, task, emit, orgId);
    } catch (err) {
      await emit("AGENT_ERROR", {
        agentId: agent.id,
        agentName: agent.name,
        message: err instanceof Error ? err.message : "Unknown error",
      });
      await prisma.agent.update({
        where: { id: agent.id },
        data: { status: "error" },
      });
    } finally {
      running.delete(agent.id);
      active--;
    }
  };

  const pm = agents.find((a) => a.position === "project_manager");
  if (pm && run.tasks.length === 0) {
    const pmTasks = buildPmTasks(run.ceoGoal);
    await prisma.task.createMany({
      data: pmTasks.map((t) => ({ ...t, runId })),
    });
    const tasks = await prisma.task.findMany({ where: { runId } });
    await prisma.workflow.create({
      data: { runId, graph: buildWorkflowGraph(tasks) },
    });
    await prisma.artifact.create({
      data: {
        runId,
        type: "task_list",
        title: "Task breakdown",
        content: JSON.stringify(pmTasks, null, 2),
      },
    });
  }

  const refreshed = await prisma.task.findMany({ where: { runId } });
  const maxRounds = 50;
  for (let round = 0; round < maxRounds; round++) {
    const pending = refreshed.filter((t) => t.status === "queued" || t.status === "in_progress");
    if (pending.length === 0 && running.size === 0) break;

    await Promise.all(agents.map((a) => tryClaim(a)));
    if (running.size > 0) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const remaining = await prisma.task.count({
    where: { runId, status: { not: "done" } },
  });

  if (remaining === 0) {
    await emitRunEvent(runId, "RUN_COMPLETED", { message: "All tasks complete" });
    await prisma.run.update({
      where: { id: runId },
      data: { status: "completed", completedAt: new Date() },
    });
  } else {
    await prisma.run.update({ where: { id: runId }, data: { status: "failed" } });
  }
}

function buildPmTasks(ceoGoal: string) {
  return [
    {
      title: "Write PRD",
      description: `Create a PRD for: ${ceoGoal}`,
      position: "project_manager",
      priority: 10,
      dependsOnIds: [] as string[],
    },
    {
      title: "Define architecture",
      description: `Choose stack and structure for: ${ceoGoal}`,
      position: "tech_architect",
      priority: 9,
      dependsOnIds: [] as string[],
    },
    {
      title: "Build login UI",
      description: "Frontend login and registration screens",
      position: "frontend_engineer",
      priority: 8,
      dependsOnIds: [] as string[],
    },
    {
      title: "Build dashboard UI",
      description: "Main habit tracking dashboard",
      position: "frontend_engineer",
      priority: 7,
      dependsOnIds: [] as string[],
    },
    {
      title: "Auth API",
      description: "Login/register/session endpoints",
      position: "backend_engineer",
      priority: 8,
      dependsOnIds: [] as string[],
    },
    {
      title: "Habits API",
      description: "CRUD endpoints for habits",
      position: "backend_engineer",
      priority: 7,
      dependsOnIds: [] as string[],
    },
    {
      title: "Test plan",
      description: "QA test cases for core flows",
      position: "qa_engineer",
      priority: 6,
      dependsOnIds: [] as string[],
    },
    {
      title: "Review deliverables",
      description: "Final QA review",
      position: "qa_engineer",
      priority: 5,
      dependsOnIds: [] as string[],
    },
  ];
}
