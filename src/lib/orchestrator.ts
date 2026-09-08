import type { Agent, Task } from "@prisma/client";
import { prisma } from "./db";
import { createProvider, resolveProviderConfig, estimateCost } from "./providers";
import type { AgentEventPayload } from "./events";
import { evalStayInRole } from "./evals";
import {
  buildWorkflowGraph,
  WORKFLOW_STAGES,
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
  type WorkflowStage,
} from "./workflow";
import {
  decideTokenSpendGate,
  isTokenSpendGateError,
  TokenSpendGateError,
  TOKEN_SOFT_GATE_TITLE,
  type TokenSpendGateKind,
} from "./token-spend-gate";
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
  isShellStubAppJs,
  looksLikeArchitectureBrainstorm,
  punchListRequiresAppJs,
  qaFixRequiresFullAppJs,
  STATIC_SHIP_BAR,
} from "./prompts";
import {
  hasUnclosedFence,
  leftoverProse,
  mergeProjectFiles,
  parseFileFences,
  scaffoldGaps,
  toFileFences,
} from "./project-files";
import { utilitiesCssFile, ensureHtmlLinksUtilitiesCss, ensureHtmlWorkspaceShellClass } from "./pixel-utilities-css";
import {
  changesAskForUi,
  FOLLOW_UP_IMPLEMENT_TITLE,
  isFollowUpGoal,
  isFollowUpImplementTitle,
  parseFollowUpGoal,
  REQUEST_CHANGES_FILES_TITLE,
  surgicalFollowUpPlan,
} from "./follow-up-goal";
import {
  ASK_CONFIRMATION_TITLE,
  parseAskConfirmationChecklist,
} from "./run-completion-summary";
import {
  IMPLEMENT_APP_LOGIC_TITLE,
  IMPLEMENT_UI_SHELL_TITLE,
  isAppLogicTitle,
  isUiShellTitle,
  needsStagedUiBuild,
  UI_DESIGN_BAR,
} from "./ui-build-pipeline";
import {
  augmentProjectFilesForShipEval,
  evalShippedProject,
  formatShipReport,
  javascriptSyntaxError,
} from "./ship-quality";
import { evalPlanQuality, ensurePlanPassesRoleAssignments, formatPlanReport } from "./plan-quality";
import {
  parsePlanDecisions,
  stripDecisionFence,
  type PlanDecision,
} from "./plan-decisions";
import {
  engineeringAssignment,
  ENGINEER_POSITIONS,
  buildersOnTeam,
  filterAutoHireRoles,
  isSoloSeniorBuild,
  pickOne,
  qaOnTeam,
  REVIEWER_POSITIONS,
  DISPATCHER_POSITION,
} from "./roster";
import { ensureRole, isPositionKey } from "./hire";
import { configureAgentsForRun, getDefaultModel, workspaceHasProvider } from "./run-setup";
import {
  parseRunBrain,
  resolveAutoHireBrain,
  RUN_BRAIN_TITLE,
} from "./run-brain";
import { planningStageModelOverride } from "./stage-models";
import { findProviderCredential } from "./provider-credentials";
import type { PositionKey } from "./constants";
import {
  getOrCreateExecution,
  projectMilestone,
  settleAttempt,
  startOrResumeAttempt,
} from "./execution-runtime";
import {
  INITIAL_QA_TITLE,
  QA_HONEST_RECHECK_TITLE,
  countQaReworkRounds,
  hasPendingHonestQaRecheck,
  isQaFixTitle,
  isQaReviewTitle,
  isQaReworkExhaustedMessage,
  markHonestQaRecheckConsumed,
  nextQaReworkRound,
  parseQaVerdict,
  qaFixTitle,
  qaRecheckTitle,
  qaReworkExhaustedMessage,
  qaReworkRoundLimit,
  QA_REWORK_EXTENDED_TITLE,
} from "./qa-verdict";

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

/** Current shipped code for surgical QA fixes and honest QA review. */
async function loadShippedCodeSnapshot(runId: string): Promise<string> {
  const code = await prisma.artifact.findMany({
    where: { runId, type: "code", filePath: { not: null } },
    select: { filePath: true, content: true },
    orderBy: { filePath: "asc" },
  });
  if (code.length === 0) return "";

  // Prefer HTML/CSS/JS product files first so QA sees markup before large READMEs.
  const rank = (path: string) => {
    if (/\.html?$/i.test(path)) return 0;
    if (/\.css$/i.test(path)) return 1;
    if (/\.jsx?$/i.test(path) || /\.tsx?$/i.test(path)) return 2;
    return 3;
  };
  const sorted = [...code].sort(
    (a, b) => rank(a.filePath!) - rank(b.filePath!) || a.filePath!.localeCompare(b.filePath!),
  );

  const parts: string[] = [];
  let used = 0;
  // Budget must fit a full static app (HTML+CSS+JS). An 8k/file cut mid-init() made QA
  // FAIL shops/listeners that existed past the truncation — false punch lists forever.
  const TOTAL_BUDGET = 48_000;
  for (const artifact of sorted) {
    const path = artifact.filePath!;
    const remaining = TOTAL_BUDGET - used;
    if (remaining < 200) break;
    const raw = artifact.content;
    const content =
      raw.length > remaining
        ? `${raw.slice(0, remaining)}\n/* …truncated for prompt — prefer smaller files */`
        : raw;
    const block = `\`\`\`file:${path}\n${content}\n\`\`\``;
    parts.push(block);
    used += block.length;
  }
  return parts.join("\n\n");
}

async function loadShippedProjectFiles(
  runId: string,
): Promise<Array<{ path: string; content: string }>> {
  const code = await prisma.artifact.findMany({
    where: { runId, type: "code", filePath: { not: null } },
    select: { filePath: true, content: true },
  });
  return code
    .filter((a) => a.filePath)
    .map((a) => ({ path: a.filePath!, content: a.content }));
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
  const isQaFixTask = isQaFixTitle(task.title);
  const isFollowUpTask = isFollowUpImplementTitle(task.title);
  const isShellTask = isUiShellTitle(task.title);
  const isLogicTask = isAppLogicTitle(task.title);
  const isSurgicalPatch = isQaFixTask || isFollowUpTask || isLogicTask;
  const seniorBuilding =
    agent.position === "tech_architect" &&
    (/^Implement\b/i.test(task.title) || isSurgicalPatch || isShellTask);
  if (kind === "dispatch" || kind === "synth" || kind === "legacy") config.maxTokens = 2200;
  else if (kind === "council") config.maxTokens = 1200;
  else if (isShellTask && (isEngineer || seniorBuilding)) config.maxTokens = 4500;
  else if (
    isQaFixTask &&
    qaFixRequiresFullAppJs(task.description ?? "") &&
    (isEngineer || seniorBuilding)
  )
    config.maxTokens = 8000;
  else if (isSurgicalPatch && (isEngineer || seniorBuilding)) config.maxTokens = 4500;
  else if (isEngineer || seniorBuilding) config.maxTokens = 5000;
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
  const isQaReview =
    agent.position === "qa_engineer" && isQaReviewTitle(task.title);
  if (isQaReview) {
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

  // Fix agents, follow-up patches, logic stage, and QA reviewers need real artifacts.
  const shippedSnapshot =
    isSurgicalPatch || isQaReview || isLogicTask
      ? await loadShippedCodeSnapshot(runId)
      : "";

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
                task.title,
                {
                  followUpQa:
                    agent.position === "qa_engineer" && isFollowUpGoal(ceoGoal),
                  qaFixFullAppJs:
                    isQaFixTask && qaFixRequiresFullAppJs(task.description ?? ""),
                },
              );

  const goalAlreadyInDescription =
    Boolean(task.description) &&
    ceoGoal.length > 0 &&
    task.description!.includes(ceoGoal);
  const ceoBlock = goalAlreadyInDescription
    ? ""
    : `CEO source of truth (acceptance criteria):\n${ceoGoal}`;
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
    : isSurgicalPatch
      ? [
          isFollowUpTask
            ? (() => {
                const { baseGoal, changes } = parseFollowUpGoal(ceoGoal);
                const wantsUi = changesAskForUi(changes);
                return [
                  wantsUi
                    ? `Original product (keep the same product — UI refresh IS in scope):\n${baseGoal}`
                    : `Original product (keep this — patch only, no gratuitous redesign):\n${baseGoal}`,
                  `Changes I want / must-fix (ALL of these — do not drop older items):\n${changes || ceoGoal}`,
                ].join("\n\n");
              })()
            : isQaFixTask
              ? `Product under fix (do NOT re-plan the stack):\n${(parseFollowUpGoal(ceoGoal).baseGoal || ceoGoal).slice(0, 600)}`
              : ceoBlock,
          prior ? `QA punch list / upstream:\n${prior}` : "",
          `Your task: ${task.title}\n${goalAlreadyInDescription ? "" : task.description ?? ""}`.trim(),
          shippedSnapshot
            ? `CURRENT shipped files (edit these — emit only paths you change):\n${shippedSnapshot}`
            : "No shipped files found yet — emit only the minimum files needed for the requested change.",
          isFollowUpTask
            ? "Request-changes patch: emit changed files as complete file fences. Satisfy every must-fix item (bugs and UI asks). Do not reply with only prose."
            : isLogicTask
              ? "Logic stage: emit changed files (usually app.js). Preserve the UI shell chrome — do not replace it with a bare canvas MVP."
              : isQaFixTask
                ? "OUTPUT RULE: Reply with ```file:path fences ONLY. No stack tables, no Technical Brainstorm, no architecture essay. Patch the punch list — usually app.js."
                : "Surgical fix only: emit changed files as complete file fences. Do not rewrite the whole app.",
        ]
          .filter(Boolean)
          .join("\n\n")
      : isQaReview
        ? [
            ceoBlock,
            `Your task: ${task.title}`,
            goalAlreadyInDescription ? "" : task.description ?? "",
            shipContext ? `Deterministic ship check:\n${shipContext}` : "",
            shippedSnapshot
              ? `CURRENT shipped files (authoritative — review these, not truncated fix logs):\n${shippedSnapshot}`
              : "No shipped code artifacts found yet.",
            prior
              ? `Recent engineer output (secondary; may be incomplete patches):\n${prior}`
              : "",
            "Judge the CURRENT shipped files above. Features may be split across HTML/CSS/JS. Do not FAIL items that are already present.",
          ]
            .filter(Boolean)
            .join("\n\n")
      : [
          ceoBlock,
          prior ? `CEO context and upstream work:\n${prior}` : "",
          `Your task: ${task.title}`,
          goalAlreadyInDescription ? "" : task.description ?? "",
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
    (kind || isEngineer || seniorBuilding) &&
    (result.finishReason === "length" ||
      looksTruncated(fullOutput) ||
      hasUnclosedFence(fullOutput) ||
      parseFileFences(fullOutput).some(
        (f) => /\.m?js$/i.test(f.path) && javascriptSyntaxError(f.content),
      ))
  ) {
    result = await provider.stream(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
        { role: "assistant", content: fullOutput },
        {
          role: "user",
          content:
            "You were cut off or left incomplete JavaScript. Continue exactly from the last word. Finish every remaining section and close every file fence. Every .js file must be complete and parseable.",
        },
      ],
      onChunk,
    );
    await flushThinking(true);
  }

  // First Implement / UI shell may rewrite for ship bar. QA-fix / Request-changes / logic
  // stage are surgical — do not force a second full-app rewrite (except invalid JS / thin UI).
  if ((isEngineer || seniorBuilding) && !isSurgicalPatch) {
    const firstFiles = parseFileFences(fullOutput);
    const shipStage = isShellTask ? "shell" : "full";
    const ship = evalShippedProject(firstFiles, {
      role: agent.position,
      ceoGoal,
      stage: shipStage,
    });
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
            content:
              `${formatShipReport(ship)}\n\n` +
              `Do NOT rebuild the whole app from scratch. Emit ONLY the files that fail the checks above ` +
              `as complete \`\`\`file:path fences (full contents). Keep working files unchanged — they will be merged.\n` +
              `If the FAIL is a stripped canvas-only MVP or missing sidebars/panels, upgrade the HTML/CSS chrome ` +
              `(3-pane layout, node cards) — do not answer with a tinier canvas demo.\n` +
              `If the FAIL is missing <canvas>/<svg>, insert <canvas id="canvas"> inside #workspace/<main> — keep sidebars.\n` +
              `If the FAIL is missing linked assets, emit those CSS/JS files — do NOT replace a working index.html with a stub.\n` +
              `Only re-emit index.html if the FAIL was about that page's content/placeholders/CDN/UI chrome.\n` +
              `Do NOT add SortableJS/jQuery/CDN libs (sortable.min.js). Use native drag-and-drop or buttons.\n` +
              `Static HTML/CSS/JS only. Every .js file must be complete and parseable.`,
          },
        ],
        onChunk,
      );
      fullOutput = fullOutput || result.content;
      await flushThinking(true);
      const rewriteFiles = parseFileFences(fullOutput);
      if (rewriteFiles.length === 0) {
        fullOutput = previous;
      } else {
        const merged = mergeProjectFiles(firstFiles, rewriteFiles);
        fullOutput = toFileFences(merged);
      }
      const rewritten = evalShippedProject(parseFileFences(fullOutput), {
        role: agent.position,
        ceoGoal,
        stage: shipStage,
      });
      if (!rewritten.passed) {
        throw new RunAbortedError(
          `Engineering output still failed acceptance after rewrite.\n${formatShipReport(rewritten)}`,
        );
      }
    }
    // Materialize utilities.css + stub CSS/JS the model linked but forgot — eval already
    // treats them as present; persist/Preview must get the same set.
    if (agent.position !== "backend_engineer") {
      const shipped = parseFileFences(fullOutput);
      if (shipped.length > 0) {
        fullOutput = toFileFences(
          augmentProjectFilesForShipEval(shipped, {
            ceoGoal,
            stage: shipStage,
          }),
        );
      }
    }
  } else if ((isEngineer || seniorBuilding) && isSurgicalPatch) {
    // Request-changes / logic / QA-fix with zero file fences = the CEO's app never updates.
    if (
      (isFollowUpTask || isLogicTask || isQaFixTask) &&
      parseFileFences(fullOutput).length === 0
    ) {
      const previous = fullOutput;
      fullOutput = "";
      thinkBuf = "";
      result = await provider.stream(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
          { role: "assistant", content: previous || "(no file fences)" },
          {
            role: "user",
            content:
              "You did not emit any ```file:path fences. The CEO's Preview will not change. " +
              "Re-read CURRENT shipped files and your task. Emit the complete updated file(s) now " +
              "as ```file:path fences (full contents). Do not reply with only explanations.",
          },
        ],
        onChunk,
      );
      fullOutput = fullOutput || result.content;
      await flushThinking(true);
      if (parseFileFences(fullOutput).length === 0) {
        await prisma.artifact.create({
          data: {
            runId,
            type: "other",
            title: REQUEST_CHANGES_FILES_TITLE,
            content: JSON.stringify({
              paths: [],
              taskTitle: task.title,
              at: new Date().toISOString(),
              note: "Engineer finished with zero file fences after retry.",
            }),
          },
        });
        throw new RunAbortedError(
          isLogicTask
            ? "App logic stage finished without updating any files. Try Resume."
            : isQaFixTask
              ? "QA fix round finished without updating any files. The punch list was not applied."
              : "Request changes finished without updating any files. Try again with a clearer change list (e.g. one bug per line).",
        );
      }
    }

    // QA punch lists about listeners/stub app.js cannot be cleared by HTML/CSS alone.
    if (isQaFixTask && punchListRequiresAppJs(task.description ?? "")) {
      const emitted = parseFileFences(fullOutput);
      const appJs = emitted.find((f) => /^app\.js$/i.test(f.path.replace(/^\.\//, "")));
      if (!appJs || isShellStubAppJs(appJs.content)) {
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
              content:
                "The QA punch list requires real JavaScript behavior, but you did not emit a working app.js " +
                "(missing, or still a UI-shell stub with only console.log). " +
                "Emit a complete ```file:app.js fence with addEventListener handlers that address every " +
                "listener/handler/drag/socket/localStorage item on the punch list. HTML/CSS-only is not enough.",
            },
          ],
          onChunk,
        );
        fullOutput = fullOutput || result.content;
        await flushThinking(true);
        const retry = parseFileFences(fullOutput);
        const retryApp = retry.find((f) => /^app\.js$/i.test(f.path.replace(/^\.\//, "")));
        if (!retryApp || isShellStubAppJs(retryApp.content)) {
          throw new RunAbortedError(
            "QA fix round did not ship a working app.js (still missing or a UI-shell stub). " +
              "Punch-list items about listeners/handlers were not fixed.",
          );
        }
      }
    }

    // Senior often burns the token budget on a council-style stack brainstorm mid QA-fix.
    if (
      isQaFixTask &&
      (looksLikeArchitectureBrainstorm(fullOutput) ||
        (parseFileFences(fullOutput).length === 0 &&
          /stack|architecture|brainstorm/i.test(fullOutput.slice(0, 800))))
    ) {
      const previous = fullOutput;
      fullOutput = "";
      thinkBuf = "";
      result = await provider.stream(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
          { role: "assistant", content: previous.slice(0, 1_500) },
          {
            role: "user",
            content:
              "STOP. That was a Technical Brainstorm / architecture essay — not a QA fix. " +
              "Do NOT continue the stack redesign. Emit ONLY ```file:path fences that patch the punch list " +
              "(almost certainly a complete working app.js). No markdown tables. No council hand-off.",
          },
        ],
        onChunk,
      );
      fullOutput = fullOutput || result.content;
      await flushThinking(true);
      if (
        looksLikeArchitectureBrainstorm(fullOutput) ||
        parseFileFences(fullOutput).length === 0
      ) {
        throw new RunAbortedError(
          "QA fix round wrote an architecture brainstorm instead of file patches. " +
            "Punch-list items were not applied — try Resume.",
        );
      }
    }

    const fixFiles = parseFileFences(fullOutput);
    const jsFails = fixFiles.filter(
      (f) => /\.m?js$/i.test(f.path) && javascriptSyntaxError(f.content),
    );
    if (jsFails.length > 0) {
      const detail = jsFails
        .map((f) => `${f.path}: ${javascriptSyntaxError(f.content)}`)
        .join("; ");
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
            content:
              `Your emitted JavaScript does not parse (${detail}). ` +
              `That causes Uncaught SyntaxError in Preview and dead forms/buttons. ` +
              `Re-emit ONLY the complete, parseable .js file(s) as full \`\`\`file:path fences. ` +
              `Do not truncate mid-line or mid-template-string.`,
          },
        ],
        onChunk,
      );
      fullOutput = fullOutput || result.content;
      await flushThinking(true);
      if (parseFileFences(fullOutput).length === 0) fullOutput = previous;
      const repaired = parseFileFences(fullOutput).filter((f) =>
        jsFails.some((j) => j.path === f.path),
      );
      const stillBad = repaired.filter(
        (f) => /\.m?js$/i.test(f.path) && javascriptSyntaxError(f.content),
      );
      if (stillBad.length > 0) {
        console.warn(
          `[PixelCrew] QA-fix still emitted invalid JS (${stillBad
            .map((f) => f.path)
            .join(", ")}); broken scripts will not be persisted.`,
        );
      }
    }

    if (isLogicTask) {
      const emitted = parseFileFences(fullOutput);
      const shippedFiles = await loadShippedProjectFiles(runId);
      const merged = mergeProjectFiles(shippedFiles, emitted);
      let ship = evalShippedProject(merged, {
        role: agent.position,
        ceoGoal,
        stage: "full",
      });
      if (!ship.passed) {
        fullOutput = "";
        thinkBuf = "";
        result = await provider.stream(
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
            { role: "assistant", content: toFileFences(emitted) || "(no file fences)" },
            {
              role: "user",
              content:
                `${formatShipReport(ship)}\n\n` +
                `Upgrade against the FAIL list. Preserve the UI shell chrome. ` +
                `Emit only changed files as complete fences. ` +
                `If chrome is missing, restore sidebars/panels/node cards — no bare-canvas MVP.`,
            },
          ],
          onChunk,
        );
        fullOutput = fullOutput || result.content;
        await flushThinking(true);
        const retryEmit = parseFileFences(fullOutput);
        if (retryEmit.length === 0) {
          throw new RunAbortedError(
            `App logic still failed acceptance after rewrite.\n${formatShipReport(ship)}`,
          );
        }
        ship = evalShippedProject(mergeProjectFiles(merged, retryEmit), {
          role: agent.position,
          ceoGoal,
          stage: "full",
        });
        if (!ship.passed) {
          throw new RunAbortedError(
            `App logic still failed acceptance after rewrite.\n${formatShipReport(ship)}`,
          );
        }
        fullOutput = toFileFences(
          augmentProjectFilesForShipEval(mergeProjectFiles(merged, retryEmit), {
            ceoGoal,
            stage: "full",
          }),
        );
      }
    }
  }

  let pendingDecisions: PlanDecision[] = [];
  if (kind === "synth" || kind === "legacy") {
    const firstDecisions = parsePlanDecisions(fullOutput);
    let quality = evalPlanQuality(stripDecisionFence(fullOutput), { ceoGoal });
    if (!quality.passed) {
      // Cheap deterministic fix for Product-builds-HTML / Senior-does-CSS slips.
      const roleFix = ensurePlanPassesRoleAssignments(stripDecisionFence(fullOutput), {
        ceoGoal,
      });
      if (roleFix.report.passed) {
        fullOutput = roleFix.plan;
        quality = roleFix.report;
      } else {
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
              content: `${formatPlanReport(quality)}\n\nRewrite the combined plan and fix every FAIL. Keep Goal, stack, UX, features, out of scope, and a role-correct task list. Static HTML/CSS/JS. Size the timeline to hours for a one-pager — Engineer builds the files, not Product. Product may own hero/footer *copy* but must not write HTML/CSS/JS. Keep any decisions json fence at the end.`,
            },
          ],
          onChunk,
        );
        fullOutput = fullOutput || result.content;
        await flushThinking(true);
        if (!fullOutput.trim()) fullOutput = previous;
        quality = evalPlanQuality(stripDecisionFence(fullOutput), { ceoGoal });
        if (!quality.passed) {
          const again = ensurePlanPassesRoleAssignments(stripDecisionFence(fullOutput), {
            ceoGoal,
          });
          if (again.report.passed) {
            fullOutput = again.plan;
            quality = again.report;
          } else {
            throw new RunAbortedError(
              `Combined plan still drifted from the CEO goal after rewrite.\n${formatPlanReport(again.report)}`,
            );
          }
        }
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

  if (isQaReview) {
    const checklist = parseAskConfirmationChecklist(fullOutput);
    if (checklist.length > 0) {
      await prisma.artifact.create({
        data: {
          runId,
          type: "other",
          title: ASK_CONFIRMATION_TITLE,
          content: JSON.stringify({
            items: checklist.map(({ label, status }) => ({ label, status })),
            taskTitle: task.title,
            at: new Date().toISOString(),
          }),
        },
      });
    }
  }

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
  // Only Implement / Request-changes / QA-fix may ship code. Planning council often
  // dumps fences that look like "coding" — persisting them causes a full rewrite later.
  const mayShipCode =
    isSurgicalPatch ||
    isShellTask ||
    /^Implement\b/i.test(task.title) ||
    isFollowUpImplementTitle(task.title);
  if (files.length > 0 && mayShipCode) {
    // Never overwrite a working app.js with a truncated emit (Preview SyntaxError + dead UI).
    const syntaxOk = files.filter((file) => {
      if (!/\.m?js$/i.test(file.path)) return true;
      const err = javascriptSyntaxError(file.content);
      if (!err) return true;
      console.warn(
        `[PixelCrew] Refusing to persist invalid ${file.path}: ${err}`,
      );
      return false;
    });
    // Request-changes / logic often emit HTML+CSS without a real app.js. Augmenting
    // that emit alone used to invent a stub app.js and wipe the working script on disk.
    const shipped =
      isSurgicalPatch || isFollowUpTask || isLogicTask
        ? await loadShippedProjectFiles(runId)
        : [];
    const mergedForPersist =
      shipped.length > 0 ? mergeProjectFiles(shipped, syntaxOk) : syntaxOk;
    const persistable =
      agent.position === "backend_engineer"
        ? syntaxOk
        : augmentProjectFilesForShipEval(mergedForPersist, {
            ceoGoal,
            stage: isShellTask ? "shell" : "full",
          }).filter((file) => {
            if (!/\.m?js$/i.test(file.path)) return true;
            return !javascriptSyntaxError(file.content);
          });
    if (persistable.length > 0) {
      await persistProjectFiles(runId, persistable);
      if (isFollowUpTask) {
        const changedPaths = persistable
          .filter((f) => {
            const before = shipped.find((s) => s.path === f.path)?.content;
            return before !== f.content;
          })
          .map((f) => f.path);
        await prisma.artifact.create({
          data: {
            runId,
            type: "other",
            title: REQUEST_CHANGES_FILES_TITLE,
            content: JSON.stringify({
              paths: changedPaths.length > 0 ? changedPaths : persistable.map((f) => f.path),
              taskTitle: task.title,
              at: new Date().toISOString(),
            }),
          },
        });
      }
    } else if (isFollowUpTask && files.length > 0) {
      await prisma.artifact.create({
        data: {
          runId,
          type: "other",
          title: REQUEST_CHANGES_FILES_TITLE,
          content: JSON.stringify({
            paths: [],
            rejected: files.map((f) => f.path),
            taskTitle: task.title,
            at: new Date().toISOString(),
            note: "Engineer emitted fences but none were persistable (e.g. invalid JS).",
          }),
        },
      });
    }
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
  } else if (files.length > 0 && !mayShipCode) {
    console.warn(
      `[PixelCrew] Ignoring ${files.length} file fence(s) from non-ship task “${task.title}” (planning/review — code belongs in Implement).`,
    );
    if (artifactType) {
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
  await ensureUtilitiesCssArtifact(runId);
}

/** Local Tailwind-lite pack — Preview CSP forbids CDN Tailwind. */
async function ensureUtilitiesCssArtifact(runId: string) {
  const util = utilitiesCssFile();
  const existing = await prisma.artifact.findFirst({
    where: { runId, filePath: util.path },
  });
  if (!existing) {
    const code = await prisma.artifact.findMany({
      where: { runId, type: "code", filePath: { not: null } },
      select: { filePath: true },
      take: 50,
    });
    if (code.some((a) => a.filePath && /\.html?$/i.test(a.filePath))) {
      await prisma.artifact.create({
        data: {
          runId,
          type: "code",
          title: util.path,
          content: util.content,
          filePath: util.path,
        },
      });
    }
  }

  // Link utilities.css (+ shell class) into every HTML page — file alone does not style Preview.
  const htmlArts = await prisma.artifact.findMany({
    where: { runId, type: "code", filePath: { not: null } },
  });
  for (const art of htmlArts) {
    if (!art.filePath || !/\.html?$/i.test(art.filePath)) continue;
    let next = ensureHtmlLinksUtilitiesCss(art.content);
    next = ensureHtmlWorkspaceShellClass(next);
    if (next !== art.content) {
      await prisma.artifact.update({
        where: { id: art.id },
        data: { content: next },
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
  const existing = await prisma.agent.findMany({
    where: { workspaceId },
    select: { position: true },
  });
  const unique = filterAutoHireRoles(existing, needed);
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
  const followUp = isFollowUpGoal(ceoGoal);
  const task = await prisma.task.create({
    data: {
      runId,
      title: DISPATCH_TITLE,
      description: followUp
        ? `CEO Request-changes (surgical patch — do NOT redesign):\n${ceoGoal}\n\nStaff Product, Senior Developer, and UI/UX briefly. The plan must keep the existing app and only apply "Changes I want".`
        : `CEO goal:\n${ceoGoal}\n\nStaff Product, Senior Developer, and UI/UX. Write a brief the CEO can understand.`,
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
  let planText =
    planTask?.output || run.artifacts.find((a) => a.type === "prd")?.content || "";
  if (!planText.trim()) {
    throw new Error("No combined plan to publish");
  }
  const goalForPlan = isFollowUpGoal(run.ceoGoal)
    ? parseFollowUpGoal(run.ceoGoal).baseGoal || run.ceoGoal
    : run.ceoGoal;
  let publishQuality = evalPlanQuality(planText, { ceoGoal: goalForPlan });
  if (!publishQuality.passed) {
    const fixed = ensurePlanPassesRoleAssignments(planText, { ceoGoal: goalForPlan });
    if (fixed.report.passed) {
      planText = fixed.plan;
      publishQuality = fixed.report;
      if (planTask) {
        await prisma.task.update({
          where: { id: planTask.id },
          data: { output: planText },
        });
      }
    } else {
      throw new Error(
        `This plan no longer matches the CEO goal and cannot be published.\n${formatPlanReport(fixed.report)}`,
      );
    }
  }
  let agents = run.workspace.agents;
  const sample = agents[0];
  const runBrainArt = await prisma.artifact.findFirst({
    where: { runId, title: RUN_BRAIN_TITLE },
    select: { content: true },
  });
  const hireBrain = resolveAutoHireBrain({
    runBrain: parseRunBrain(runBrainArt?.content),
    sample: sample
      ? { provider: sample.provider, model: sample.model }
      : null,
  });
  let assignment = engineeringAssignment(agents);

  // Only auto-hire a generalist engineer when nobody can build (no senior, no eng seats).
  if (assignment.mode === "none") {
    await ensureRole({
      workspaceId: run.workspaceId,
      position: "engineer",
      provider: hireBrain.provider,
      model: hireBrain.model,
    });
    if (hireBrain.provider !== "mock") {
      await configureAgentsForRun(
        run.workspaceId,
        hireBrain.provider,
        hireBrain.model,
      );
    }
    agents = await prisma.agent.findMany({ where: { workspaceId: run.workspaceId } });
    assignment = engineeringAssignment(agents);
  }

  // Product policy: QA is mandatory on every publish — never ship without a reviewer seat.
  if (qaOnTeam(agents).length === 0) {
    await ensureRole({
      workspaceId: run.workspaceId,
      position: "qa_engineer",
      provider: hireBrain.provider,
      model: hireBrain.model,
    });
    if (hireBrain.provider !== "mock") {
      await configureAgentsForRun(
        run.workspaceId,
        hireBrain.provider,
        hireBrain.model,
      );
    }
    agents = await prisma.agent.findMany({ where: { workspaceId: run.workspaceId } });
  }

  await prisma.artifact.create({
    data: {
      runId,
      type: "other",
      title: PLAN_PUBLISHED_TITLE,
      content: `Published by CEO.\nRoster: ${agents.map((a) => `${a.name} (${a.position})`).join(", ")}`,
    },
  });

  const capacityNote = isSoloSeniorBuild(assignment)
    ? "One engineer is building (Senior Developer — not parallel FE/BE)."
    : assignment.mode === "split"
      ? "Frontend and backend seats will build in parallel (capped)."
      : `Engineering capacity: ${assignment.positions.join(", ") || "none"}.`;

  const followUp = isFollowUpGoal(run.ceoGoal);
  const { changes: followUpChanges } = parseFollowUpGoal(run.ceoGoal);
  // Request-changes: skip Senior "review" LLM — go straight to surgical Implement.
  const reviewer = followUp ? null : pickOne(agents, REVIEWER_POSITIONS);

  const reviewTask = reviewer
    ? await prisma.task.create({
        data: {
          runId,
          title: "Review published plan and delegate",
          description: `The CEO goal is the source of truth:\n${run.ceoGoal}\n\nThe CEO published this plan. Review it without changing the product. ${capacityNote}\nDelegate clearly — do NOT write production HTML/CSS/JS here (no \`\`\`file: fences). Implement owns the real code after this review.\n\nPlan:\n${planText.slice(0, 4000)}`,
          position: reviewer.position,
          priority: 90,
          dependsOnIds: planTask ? [planTask.id] : [],
        },
      })
    : null;

  const dependsOn = reviewTask ? [reviewTask.id] : planTask ? [planTask.id] : [];
  const buildIds: string[] = [];
  const surgicalDesc =
    `CEO Request-changes (surgical):\n${followUpChanges || run.ceoGoal}\n\n` +
    `CURRENT app files are already on this run. Apply every requested change so it works in Preview. ` +
    `If the CEO asked for a UI overhaul / modern refresh, update CSS/HTML (and JS if needed). ` +
    `Satisfy ALL open Changes I want items (including older ones still listed). ` +
    `Emit ONLY changed files as complete \`\`\`file:path fences. Keep the same product.\n` +
    STATIC_SHIP_BAR;

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
  } else if (followUp) {
    // Request changes: one surgical patch owner — never dual FE/BE full rebuilds.
    const pos = buildersOnTeam(agents)[0]?.position ?? assignment.soloPosition ?? "engineer";
    const work = await prisma.task.create({
      data: {
        runId,
        title: FOLLOW_UP_IMPLEMENT_TITLE,
        description: surgicalDesc,
        position: pos,
        priority: 80,
        dependsOnIds: dependsOn,
      },
    });
    buildIds.push(work.id);
  } else if (assignment.mode === "split") {
    const fe = await prisma.task.create({
      data: {
        runId,
        title: "Implement frontend from the plan",
        description:
          `CEO source of truth:\n${run.ceoGoal}\n\nEmit a complete demo UI (index.html, CSS, JS) using \`\`\`file:path fences. Implement every named screen, control, state, formula, and visual constraint. Specific copy from the CEO goal — not John Doe / Project One. CSS or inline SVG for visuals (no missing assets). Do not overwrite data.js.\n${UI_DESIGN_BAR}\n${STATIC_SHIP_BAR}`,
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
  } else if (needsStagedUiBuild(run.ceoGoal)) {
    // Complex workspace/editor goals: UI shell first, then logic (avoids single-shot overload).
    const pos = assignment.soloPosition!;
    const capacity = isSoloSeniorBuild(assignment)
      ? "You are the only engineering capacity (Senior Developer)."
      : `You are the only engineering capacity (${pos}).`;
    const shell = await prisma.task.create({
      data: {
        runId,
        title: IMPLEMENT_UI_SHELL_TITLE,
        description:
          `CEO source of truth:\n${run.ceoGoal}\n\n${capacity}\n` +
          `STAGE 1 — UI SHELL ONLY. Emit index.html + styles.css + a stub app.js.\n` +
          `Build the full visual chrome (3-pane when this is an editor/workspace): sidebars, toolbars, HTML node cards, properties panel. Dark theme CSS.\n` +
          `Do NOT implement graph math, persistence, or cable algorithms yet.\n` +
          `${UI_DESIGN_BAR}\n${STATIC_SHIP_BAR}`,
        position: pos,
        priority: 85,
        dependsOnIds: dependsOn,
      },
    });
    const logic = await prisma.task.create({
      data: {
        runId,
        title: IMPLEMENT_APP_LOGIC_TITLE,
        description:
          `CEO source of truth:\n${run.ceoGoal}\n\n${capacity}\n` +
          `STAGE 2 — APP LOGIC. CURRENT UI shell is already shipped on this run.\n` +
          `Wire interactions, state, localStorage, and canvas/SVG cables. Preserve the shell — do not replace with a bare canvas MVP.\n` +
          `Emit ONLY changed files as complete \`\`\`file:path fences (usually app.js).\n` +
          `${UI_DESIGN_BAR}\n${STATIC_SHIP_BAR}`,
        position: pos,
        priority: 80,
        dependsOnIds: [shell.id],
      },
    });
    buildIds.push(shell.id, logic.id);
  } else {
    const pos = assignment.soloPosition!;
    const work = await prisma.task.create({
      data: {
        runId,
        title: "Implement product work from the plan",
        description: isSoloSeniorBuild(assignment)
          ? `CEO source of truth:\n${run.ceoGoal}\n\nYou are the only engineering capacity (Senior Developer). One engineer is building — not parallel FE/BE. Emit a complete runnable static app (index.html + CSS + JS) using \`\`\`file:path fences. Implement every named screen, control, state, formula, and visual constraint. Specific copy from the CEO goal, CSS/SVG visuals — no missing images, no John Doe placeholders.\n${UI_DESIGN_BAR}\n${STATIC_SHIP_BAR}`
          : `CEO source of truth:\n${run.ceoGoal}\n\nYou are the only engineering capacity (${pos}). Emit a complete runnable static app (index.html + CSS + JS) using \`\`\`file:path fences. Implement every named screen, control, state, formula, and visual constraint. Specific copy from the CEO goal, CSS/SVG visuals — no missing images, no John Doe placeholders.\n${UI_DESIGN_BAR}\n${STATIC_SHIP_BAR}`,
        position: pos,
        priority: 80,
        dependsOnIds: dependsOn,
      },
    });
    buildIds.push(work.id);
  }

  if (buildIds.length > 0) {
    if (qaOnTeam(agents).length === 0) {
      await ensureRole({
        workspaceId: run.workspaceId,
        position: "qa_engineer",
        provider: hireBrain.provider,
        model: hireBrain.model,
      });
      agents = await prisma.agent.findMany({ where: { workspaceId: run.workspaceId } });
    }
    await prisma.task.create({
      data: {
        runId,
        title: INITIAL_QA_TITLE,
        description: followUp
          ? `CEO Request-changes to verify:\n${followUpChanges || run.ceoGoal}\n\nReview CURRENT shipped files against EACH asked change.\nFAIL if a requested bug is still broken or a requested UI overhaul has no meaningful CSS/HTML change.\nFAIL if previously working primary controls clearly regressed or app.js looks like a shell stub / truncated script.\nDo NOT PASS just because the old product still loads.\nReply: Verdict FAIL or PASS, then one - [MET] / - [MISSING] line per asked change. PASS only if every item is [MET].`
          : `CEO source of truth:\n${run.ceoGoal}\n\nReview the actual emitted files against every acceptance criterion in that goal. Verdict FAIL or PASS, then a punch list. Fail wrong product type/name, missing screens or controls, invented template sections, inline JS, truncated/stub scripts, localStorage overwrites, hidden forms, and unsafe external links. Do not invent passing results. Do not rewrite the product.`,
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

type QaReworkDecision =
  | { action: "pass" }
  | { action: "none" }
  | { action: "exhausted"; message: string }
  | { action: "rework"; round: number }
  | { action: "recheck_only" };

/**
 * After a QA stage finishes: PASS → done; FAIL → open engineer fixes + re-QA
 * (capped); Resume may first run an honest QA-only recheck (full files) so a
 * false FAIL can become PASS without another engineer burn; exhausted FAIL →
 * ship current files (Preview/ZIP), keep run failed so Resume can extend.
 * UNKNOWN does not open a loop.
 */
async function decideAndEnqueueQaRework(
  runId: string,
  ceoGoal: string,
  agents: Agent[],
  emit: EmitFn,
): Promise<QaReworkDecision> {
  if (qaOnTeam(agents).length === 0) return { action: "none" };

  const qaTasks = await prisma.task.findMany({
    where: { runId, position: "qa_engineer", status: "done" },
    orderBy: [{ completedAt: "desc" }, { updatedAt: "desc" }],
  });
  const latest = qaTasks.find((t) => isQaReviewTitle(t.title));
  if (!latest) return { action: "none" };

  const { verdict, punchList } = parseQaVerdict(latest.output);
  const checklist = parseAskConfirmationChecklist(latest.output);
  // Client truth: cannot PASS while any ask is still [MISSING].
  const missingAsks = checklist.filter((i) => i.status === "missing");
  const effectiveVerdict =
    verdict === "PASS" && missingAsks.length > 0 ? "FAIL" : verdict;
  const effectivePunch =
    effectiveVerdict === "FAIL" && missingAsks.length > 0 && !punchList.trim()
      ? missingAsks.map((i) => `MISSING: ${i.label}`).join("\n")
      : punchList;

  if (effectiveVerdict === "PASS") return { action: "pass" };
  if (effectiveVerdict !== "FAIL") return { action: "none" };

  const allTasks = await prisma.task.findMany({
    where: { runId },
    select: { id: true, title: true, dependsOnIds: true, status: true },
  });
  const alreadyOpened = allTasks.some(
    (t) =>
      t.dependsOnIds.includes(latest.id) &&
      (isQaFixTitle(t.title) || isQaReviewTitle(t.title)),
  );
  if (alreadyOpened) return { action: "none" };

  const gateArts = await prisma.artifact.findMany({
    where: { runId },
    select: { id: true, title: true, content: true },
  });
  const roundLimit = qaReworkRoundLimit(gateArts);
  const completedRounds = countQaReworkRounds(allTasks);
  if (completedRounds >= roundLimit) {
    return {
      action: "exhausted",
      message: qaReworkExhaustedMessage(roundLimit),
    };
  }

  // After Resume extension: re-QA with full shipped files before spending another fix round.
  if (hasPendingHonestQaRecheck(gateArts)) {
    const pending = gateArts.find(
      (a) =>
        a.title === QA_REWORK_EXTENDED_TITLE &&
        hasPendingHonestQaRecheck([a]),
    );
    if (pending) {
      await prisma.artifact.update({
        where: { id: pending.id },
        data: { content: markHonestQaRecheckConsumed(pending.content) },
      });
    }
    await prisma.task.create({
      data: {
        runId,
        title: QA_HONEST_RECHECK_TITLE,
        description: `CEO source of truth:\n${ceoGoal}\n\nHonest re-audit after Resume. Review the CURRENT shipped HTML/CSS/JS files (authoritative). Features may be split across files. Prefer PASS with nits when core Preview flows work. Do not FAIL for listeners that exist past a prior truncated view. Verdict FAIL or PASS, then a punch list with real evidence.`,
        position: "qa_engineer",
        priority: 40,
        dependsOnIds: [latest.id],
      },
    });
    const tasks = await prisma.task.findMany({ where: { runId } });
    await prisma.workflow.upsert({
      where: { runId },
      create: { runId, graph: buildWorkflowGraph(tasks) },
      update: { graph: buildWorkflowGraph(tasks) },
    });
    await emit("TASK_STARTED", {
      message: "Resume — honest QA recheck with full shipped files (no engineer burn yet)",
      taskTitle: QA_HONEST_RECHECK_TITLE,
    });
    return { action: "recheck_only" };
  }

  const engineers = buildersOnTeam(agents);
  if (engineers.length === 0) {
    return {
      action: "exhausted",
      message: "QA FAIL but no engineer on the team to fix the punch list.",
    };
  }

  const round = nextQaReworkRound(allTasks);
  const punch =
    effectivePunch.trim() ||
    "(QA did not list punch items — re-check the CEO goal against the shipped files and fix every gap.)";
  // One fix owner — FE+BE both applying the same punch list doubled tokens.
  // Keep the task body punch-focused — full CEO novels make Senior re-brainstorm the stack.
  const fixOwner = buildersOnTeam(agents)[0]!;
  const productHint = (
    isFollowUpGoal(ceoGoal)
      ? parseFollowUpGoal(ceoGoal).baseGoal || ceoGoal
      : ceoGoal
  ).slice(0, 500);
  const shippedFiles = await loadShippedProjectFiles(runId);
  const shippedAppJs = shippedFiles.find((f) => /(?:^|\/)app\.js$/i.test(f.path));
  const needsFullAppJs =
    punchListRequiresAppJs(punch) &&
    (!shippedAppJs || isShellStubAppJs(shippedAppJs.content));
  const fix = await prisma.task.create({
    data: {
      runId,
      title: qaFixTitle(round),
      description: needsFullAppJs
        ? `Product: ${productHint}\n\n` +
          `CRITICAL: shipped app.js is a UI-shell stub or missing. Surgical HTML/CSS tweaks will NOT pass QA.\n` +
          `You MUST rewrite app.js fully — emit a COMPLETE working \`\`\`file:app.js that implements EVERY punch item below ` +
          `(add/remove node, drag, sockets/connections, evaluation, localStorage, export/copy/close modal as listed).\n` +
          `OUTPUT: start with \`\`\`file:app.js — no stack tables, no Technical Brainstorm.\n\n` +
          `Punch list:\n${punch}`
        : `Product: ${productHint}\n\n` +
          `QA Verdict: FAIL (round ${round}). Patch ONLY the punch list below.\n` +
          `OUTPUT: \`\`\`file:path fences only — no stack tables, no Technical Brainstorm, no architecture essay.\n` +
          `If the punch list mentions listeners/handlers/app.js/"UI shell ready", you MUST emit a complete working \`\`\`file:app.js.\n` +
          `HTML/CSS-only patches will FAIL recheck.\n\n` +
          `Punch list:\n${punch}`,
      position: fixOwner.position,
      priority: 85,
      dependsOnIds: [latest.id],
    },
  });

  await prisma.task.create({
    data: {
      runId,
      title: qaRecheckTitle(round),
      description: `CEO source of truth:\n${ceoGoal}\n\nRe-check AFTER round ${round} surgical fixes. Verify ONLY the prior punch list below — do not re-litigate the entire product or demand a redesign.\nReply with Verdict PASS or FAIL, then [MET]/[MISSING] lines for each prior item.\nPASS only if every prior item is [MET].\n\nPrior punch list:\n${punch}`,
      position: "qa_engineer",
      priority: 40,
      dependsOnIds: [fix.id],
    },
  });

  const tasks = await prisma.task.findMany({ where: { runId } });
  await prisma.workflow.upsert({
    where: { runId },
    create: { runId, graph: buildWorkflowGraph(tasks) },
    update: { graph: buildWorkflowGraph(tasks) },
  });

  await emit("TASK_STARTED", {
    message: `QA FAIL — engineering fix round ${round}/${roundLimit}`,
    taskTitle: qaFixTitle(round),
  });

  return { action: "rework", round };
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
  const runBrainArt = await prisma.artifact.findFirst({
    where: { runId, title: RUN_BRAIN_TITLE },
    select: { content: true },
  });
  const brain = resolveAutoHireBrain({
    runBrain: parseRunBrain(runBrainArt?.content),
    sample: sample
      ? { provider: sample.provider, model: sample.model }
      : null,
  });
  let llmProvider = brain.provider;
  let llmModel = brain.model;
  // Legacy runs with no Run brain artifact + empty roster: pick first ready
  // provider (Ollama before OpenRouter). New runs always store Run brain at Start.
  if (!sample && !parseRunBrain(runBrainArt?.content) && llmProvider === "mock") {
    const candidates: Array<"ollama" | "anthropic" | "google" | "openrouter"> = [
      "ollama",
      "anthropic",
      "google",
      "openrouter",
    ];
    for (const p of candidates) {
      const check = await workspaceHasProvider(run.workspaceId, p);
      if (check.ready) {
        llmProvider = p;
        llmModel = getDefaultModel(p);
        break;
      }
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

  let published = await prisma.artifact.findFirst({
    where: { runId, title: PLAN_PUBLISHED_TITLE },
  });

  // Request-changes: skip Dispatch→Council×3→Synth→pause. Auto-publish surgical plan → Implement.
  if (!published && isFollowUpGoal(run.ceoGoal)) {
    const planBody = surgicalFollowUpPlan(run.ceoGoal);
    await prisma.artifact.create({
      data: {
        runId,
        type: "prd",
        title: "Surgical follow-up plan",
        content: planBody,
      },
    });
    await emit("TASK_STARTED", {
      message: "Request changes — skipping planning council; patching current files only",
      taskTitle: FOLLOW_UP_IMPLEMENT_TITLE,
    });
    await publishAndDelegate(runId);
    published = await prisma.artifact.findFirst({
      where: { runId, title: PLAN_PUBLISHED_TITLE },
    });
  } else if (run.tasks.length === 0) {
    await seedDispatchTask(runId, run.ceoGoal);
  }

  let abortReason: string | null = null;
  let tokenGateKind: TokenSpendGateKind | null = null;

  const executeWorkflowStage = async (stage: WorkflowStage) => {
    agents = await loadRoster();

    if (!(await isRunLoopActive(runId, loopStartedAt))) return;

    const stageTasks = await prisma.task.findMany({
      where: { runId, position: { in: stage.positions } },
    });
    if (stageTasks.length === 0) return;

    const stageAgents = agents.filter((a) => stage.positions.includes(a.position));
    if (stageAgents.length === 0) return;

    const stageCap = Math.min(
      cap,
      stage.maxParallel,
      stage.id === "build" ? Math.max(1, buildersOnTeam(agents).length) : stage.maxParallel,
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
        const gateArts = await prisma.artifact.findMany({
          where: { runId },
          select: { title: true },
        });
        const gate = decideTokenSpendGate(usage?.totalTokens ?? 0, gateArts);
        if (gate.action === "soft_gate") {
          throw new TokenSpendGateError("soft", gate.tokens);
        }
        if (gate.action === "hard_gate") {
          throw new TokenSpendGateError("hard", gate.tokens);
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
        if (isTokenSpendGateError(err)) {
          await prisma.task.update({
            where: { id: task.id },
            data: { status: "queued", claimedById: null, claimedAt: null },
          });
          await prisma.agent.update({
            where: { id: agent.id },
            data: { status: "idle" },
          });
          tokenGateKind = err.kind;
          abortReason = err.message;
          if (err.kind === "soft") {
            const existingSoft = await prisma.artifact.findFirst({
              where: { runId, title: TOKEN_SOFT_GATE_TITLE },
            });
            if (!existingSoft) {
              await prisma.artifact.create({
                data: {
                  runId,
                  type: "other",
                  title: TOKEN_SOFT_GATE_TITLE,
                  content: JSON.stringify({
                    tokens: err.tokens,
                    at: new Date().toISOString(),
                  }),
                },
              });
            }
          }
          await emit("AGENT_BLOCKED", {
            agentId: agent.id,
            agentName: agent.name,
            message: err.message,
            tokenGate: err.kind,
            taskTitle: task.title,
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
        if (idleRounds > 8) {
          const stuck = await prisma.task.findMany({
            where: {
              runId,
              position: { in: stage.positions },
              status: { in: ["queued", "claimed", "in_progress", "failed", "blocked"] },
            },
            select: { title: true, status: true, position: true },
            take: 8,
          });
          const detail =
            stuck.length > 0
              ? stuck.map((t) => `“${t.title}” (${t.status}/${t.position})`).join("; ")
              : "no claimable tasks";
          abortReason =
            `The team got stuck in ${stage.label} and stopped. ${detail}. ` +
            `Often a dependency failed earlier — Resume retries failed work, or Fork/Restart for a clean path.`;
          console.warn(`[PixelCrew] Stage ${stage.label} idle-stuck: ${detail}`);
          break;
        }
      } else {
        idleRounds = 0;
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    await waitForIdle();
  };

  for (const stage of WORKFLOW_STAGES) {
    if (PRE_PUBLISH_STAGES.has(stage.id) && published) continue;
    if (POST_PUBLISH_STAGES.has(stage.id) && !published) continue;

    await executeWorkflowStage(stage);
    if (!(await isRunLoopActive(runId, loopStartedAt))) return;
    if (abortReason) break;

    if (stage.id === "dispatch" && !published) {
      const dispatchTask = await prisma.task.findFirst({
        where: { runId, title: DISPATCH_TITLE, status: "done" },
      });
      const needed = parseNeededRoles(dispatchTask?.output ?? "", DEFAULT_COUNCIL);
      await staffRoles(
        run.workspaceId,
        [...DEFAULT_COUNCIL, ...needed, "qa_engineer"],
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

  // QA FAIL → engineer fix (each eng position) → re-QA, capped.
  if (published && !abortReason) {
    const buildStage = WORKFLOW_STAGES.find((s) => s.id === "build");
    const qaStage = WORKFLOW_STAGES.find((s) => s.id === "qa");
    while (buildStage && qaStage && !abortReason) {
      agents = await loadRoster();
      const decision = await decideAndEnqueueQaRework(
        runId,
        run.ceoGoal,
        agents,
        emit,
      );
      if (decision.action === "pass" || decision.action === "none") break;
      if (decision.action === "exhausted") {
        abortReason = decision.message;
        break;
      }
      if (decision.action === "rework") {
        await executeWorkflowStage(buildStage);
        if (!(await isRunLoopActive(runId, loopStartedAt))) return;
        if (abortReason) break;
      }
      // rework and recheck_only both run QA; recheck_only skips engineering.
      await executeWorkflowStage(qaStage);
      if (!(await isRunLoopActive(runId, loopStartedAt))) return;
    }
  }

  if (!(await isRunLoopActive(runId, loopStartedAt))) return;

  const unfinished = await prisma.task.findMany({
    where: { runId, status: { not: "done" } },
    select: { title: true, status: true, position: true },
    orderBy: { createdAt: "asc" },
    take: 12,
  });
  const remaining = unfinished.length;

  if (abortReason) {
    // QA round-cap is a quality gate, not a delete. Persist scaffold so Preview/ZIP
    // still work; keep status failed so Resume can grant more fix rounds.
    if (isQaReworkExhaustedMessage(abortReason)) {
      await persistScaffoldFiles(runId, run.ceoGoal);
      await emitRunEvent(runId, "RUN_CANCELLED", {
        message: abortReason,
        shippedDespiteQaFail: true,
      });
    } else {
      await emitRunEvent(runId, "RUN_CANCELLED", {
        message: abortReason,
        ...(tokenGateKind ? { tokenGate: tokenGateKind } : {}),
      });
    }
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
    const detail = unfinished
      .map((t) => `“${t.title}” (${t.status})`)
      .join("; ");
    const message =
      `The team stopped before finishing. Unfinished: ${detail}. ` +
      `Use Resume to retry, or start a new chat / fork if the run is stuck.`;
    console.warn(`[PixelCrew] Incomplete pipeline (${remaining} tasks): ${detail}`);
    await emitRunEvent(runId, "RUN_CANCELLED", { message });
    await prisma.run.update({
      where: { id: runId },
      data: { status: "failed", completedAt: new Date() },
    });
  }
}
