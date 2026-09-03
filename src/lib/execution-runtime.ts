import {
  type ApprovalStatus,
  type AttemptStatus,
  type EventType,
  type ExecutionStatus,
  Prisma,
  type PrismaClient,
  type RunEventSourceKind,
  type ToolEventStatus,
} from "@prisma/client";

const MAX_TEXT = 8_000;
const MAX_JSON = 32_000;
const MAX_DEPTH = 8;
const MAX_ITEMS = 100;
const REDACTED = "[REDACTED]";
const SECRET_KEY = /(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|private[-_]?key)/i;

type Db = PrismaClient | Prisma.TransactionClient;

function stableKey(namespace: string, ...parts: string[]): string {
  return [namespace, ...parts].map((part) => `${part.length}:${part}`).join("|");
}

export const executionKey = (runId: string, taskId: string) =>
  stableKey("execution:v1", runId, taskId);
export const attemptKey = (executionId: string, requestId: string) =>
  stableKey("attempt:v1", executionId, requestId);
export const toolEventKey = (attemptId: string, requestId: string) =>
  stableKey("tool:v1", attemptId, requestId);
export const checkResultKey = (attemptId: string, checkName: string) =>
  stableKey("check:v1", attemptId, checkName);
export const approvalKey = (executionId: string, requestId: string) =>
  stableKey("approval:v1", executionId, requestId);

const EXECUTION_TRANSITIONS: Record<ExecutionStatus, readonly ExecutionStatus[]> = {
  pending: ["running", "cancelled"],
  running: ["paused", "completed", "failed", "cancelled"],
  paused: ["pending", "running", "cancelled"],
  completed: ["pending"],
  failed: ["pending", "running", "cancelled"],
  cancelled: ["pending"],
};

const ATTEMPT_TRANSITIONS: Record<AttemptStatus, readonly AttemptStatus[]> = {
  starting: ["running", "failed", "cancelled"],
  running: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

const TOOL_TRANSITIONS: Record<ToolEventStatus, readonly ToolEventStatus[]> = {
  requested: ["running", "failed"],
  running: ["completed", "failed"],
  completed: [],
  failed: [],
};

export function isLegalExecutionTransition(from: ExecutionStatus, to: ExecutionStatus): boolean {
  return from === to || EXECUTION_TRANSITIONS[from].includes(to);
}

export function isLegalAttemptTransition(from: AttemptStatus, to: AttemptStatus): boolean {
  return from === to || ATTEMPT_TRANSITIONS[from].includes(to);
}

export function isLegalToolTransition(from: ToolEventStatus, to: ToolEventStatus): boolean {
  return from === to || TOOL_TRANSITIONS[from].includes(to);
}

export function boundedText(value: unknown, max = MAX_TEXT): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 14))}…[truncated]`;
}

export function validateWorkspaceKey(value: string | null | undefined): string | null {
  const key = boundedText(value, 512);
  if (
    key &&
    (key.startsWith("/") ||
      /^[a-zA-Z]:[\\/]/.test(key) ||
      key.split(/[\\/]/).includes(".."))
  ) {
    throw new TypeError("workspaceKey must be an opaque provider identifier, not a host path");
  }
  return key;
}

function sanitizeValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return `[unsupported:${typeof value}]`;
  if (seen.has(value)) throw new TypeError("Execution payload must not contain cycles");
  if (depth >= MAX_DEPTH) return "[max-depth]";

  seen.add(value);
  let result: unknown;
  if (Array.isArray(value)) {
    result = value.slice(0, MAX_ITEMS).map((item) => sanitizeValue(item, depth + 1, seen));
    if (value.length > MAX_ITEMS) (result as unknown[]).push(`[${value.length - MAX_ITEMS} more]`);
  } else {
    result = Object.fromEntries(
      Object.entries(value)
        .slice(0, MAX_ITEMS)
        .map(([key, item]) => [
          key,
          SECRET_KEY.test(key) ? REDACTED : sanitizeValue(item, depth + 1, seen),
        ]),
    );
  }
  seen.delete(value);
  return result;
}

/** Produces JSON-safe, secret-redacted, size-bounded data for durable records. */
export function sanitizeExecutionData(value: unknown): Prisma.InputJsonValue {
  const sanitized = sanitizeValue(value, 0, new WeakSet<object>());
  const serialized = JSON.stringify(sanitized);
  if (serialized === undefined) return "[unsupported:undefined]";
  if (Buffer.byteLength(serialized, "utf8") <= MAX_JSON) {
    return sanitized as Prisma.InputJsonValue;
  }
  return {
    truncated: true,
    // 4k UTF-16 code units remains below the DB's 32KB JSON limit even when every
    // character requires JSON escaping.
    preview: serialized.slice(0, 4_000),
  };
}

export async function getOrCreateExecution(
  db: Db,
  input: { runId: string; taskId: string; agentId?: string | null },
) {
  const idempotencyKey = executionKey(input.runId, input.taskId);
  return db.execution.upsert({
    where: { idempotencyKey },
    create: { ...input, idempotencyKey },
    update: input.agentId === undefined ? {} : { agentId: input.agentId },
  });
}

export async function startOrResumeAttempt(
  prisma: PrismaClient,
  input: {
    executionId: string;
    requestId: string;
    agentId?: string | null;
    workspaceKey?: string | null;
  },
) {
  const idempotencyKey = attemptKey(input.executionId, input.requestId);
  const existing = await prisma.attempt.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;

  try {
    return await prisma.$transaction(async (tx) => {
      const repeated = await tx.attempt.findUnique({ where: { idempotencyKey } });
      if (repeated) return repeated;
      const claimed = await tx.execution.updateMany({
        where: {
          id: input.executionId,
          status: { in: ["pending", "paused", "failed"] },
        },
        data: {
          attemptCounter: { increment: 1 },
          status: "running",
          agentId: input.agentId,
          startedAt: new Date(),
          completedAt: null,
          cancelledAt: null,
          lastError: null,
        },
      });
      if (claimed.count !== 1) {
        throw new Error("Execution must be reset before starting another attempt");
      }
      const execution = await tx.execution.findUniqueOrThrow({ where: { id: input.executionId } });
      return tx.attempt.create({
        data: {
          executionId: execution.id,
          runId: execution.runId,
          taskId: execution.taskId,
          agentId: input.agentId ?? execution.agentId,
          sequence: execution.attemptCounter,
          idempotencyKey,
          status: "running",
          workspaceKey: validateWorkspaceKey(input.workspaceKey),
          startedAt: new Date(),
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await prisma.attempt.findUnique({ where: { idempotencyKey } });
      if (winner) return winner;
    }
    throw error;
  }
}

export async function appendToolEvent(
  prisma: PrismaClient,
  input: {
    attemptId: string;
    requestId: string;
    toolName: string;
    toolInput: unknown;
  },
) {
  const idempotencyKey = toolEventKey(input.attemptId, input.requestId);
  const existing = await prisma.toolEvent.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;

  try {
    return await prisma.$transaction(async (tx) => {
      const repeated = await tx.toolEvent.findUnique({ where: { idempotencyKey } });
      if (repeated) return repeated;
      const claimed = await tx.attempt.updateMany({
        where: { id: input.attemptId, status: "running" },
        data: { toolSequenceCounter: { increment: 1 } },
      });
      if (claimed.count !== 1) throw new Error("Cannot append a tool event to an inactive attempt");
      const attempt = await tx.attempt.findUniqueOrThrow({ where: { id: input.attemptId } });
      return tx.toolEvent.create({
        data: {
          attemptId: attempt.id,
          runId: attempt.runId,
          taskId: attempt.taskId,
          sequence: attempt.toolSequenceCounter,
          idempotencyKey,
          toolName: boundedText(input.toolName, 200) ?? "unknown",
          input: sanitizeExecutionData(input.toolInput),
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await prisma.toolEvent.findUnique({ where: { idempotencyKey } });
      if (winner) return winner;
    }
    throw error;
  }
}

async function transitionExecution(
  db: Db,
  id: string,
  to: ExecutionStatus,
  data: Prisma.ExecutionUpdateManyMutationInput = {},
) {
  const allowedFrom = (Object.keys(EXECUTION_TRANSITIONS) as ExecutionStatus[]).filter((from) =>
    isLegalExecutionTransition(from, to),
  );
  const result = await db.execution.updateMany({
    where: { id, status: { in: allowedFrom } },
    data: { ...data, status: to },
  });
  if (result.count) return db.execution.findUniqueOrThrow({ where: { id } });
  const current = await db.execution.findUniqueOrThrow({ where: { id }, select: { status: true } });
  throw new Error(`Illegal execution transition: ${current.status} -> ${to}`);
}

async function transitionAttempt(
  db: Db,
  id: string,
  to: AttemptStatus,
  data: Prisma.AttemptUpdateManyMutationInput = {},
) {
  const allowedFrom = (Object.keys(ATTEMPT_TRANSITIONS) as AttemptStatus[]).filter((from) =>
    isLegalAttemptTransition(from, to),
  );
  const result = await db.attempt.updateMany({
    where: { id, status: { in: allowedFrom } },
    data: { ...data, status: to },
  });
  if (result.count) return db.attempt.findUniqueOrThrow({ where: { id } });
  const current = await db.attempt.findUniqueOrThrow({ where: { id }, select: { status: true } });
  throw new Error(`Illegal attempt transition: ${current.status} -> ${to}`);
}

async function transitionToolEvent(
  db: Db,
  id: string,
  to: ToolEventStatus,
  data: Prisma.ToolEventUpdateManyMutationInput = {},
) {
  const allowedFrom = (Object.keys(TOOL_TRANSITIONS) as ToolEventStatus[]).filter((from) =>
    isLegalToolTransition(from, to),
  );
  const result = await db.toolEvent.updateMany({
    where: { id, status: { in: allowedFrom } },
    data: { ...data, status: to },
  });
  if (result.count) return db.toolEvent.findUniqueOrThrow({ where: { id } });
  const current = await db.toolEvent.findUniqueOrThrow({ where: { id }, select: { status: true } });
  throw new Error(`Illegal tool transition: ${current.status} -> ${to}`);
}

export const markToolStarted = (db: Db, id: string) =>
  transitionToolEvent(db, id, "running", { startedAt: new Date() });
export const completeToolEvent = (db: Db, id: string, output: unknown) =>
  transitionToolEvent(db, id, "completed", {
    output: sanitizeExecutionData(output),
    completedAt: new Date(),
  });
export const failToolEvent = (db: Db, id: string, error: unknown) =>
  transitionToolEvent(db, id, "failed", {
    error: boundedText(error),
    completedAt: new Date(),
  });

export const completeExecution = (db: Db, executionId: string) =>
  transitionExecution(db, executionId, "completed", {
    completedAt: new Date(),
    lastError: null,
  });

export const failExecution = (db: Db, executionId: string, error: unknown) =>
  transitionExecution(db, executionId, "failed", {
    completedAt: new Date(),
    lastError: boundedText(error),
  });

export async function completeAttempt(prisma: PrismaClient, attemptId: string) {
  return prisma.$transaction(async (tx) => {
    const attempt = await transitionAttempt(tx, attemptId, "completed", { completedAt: new Date() });
    await transitionExecution(tx, attempt.executionId, "completed", {
      completedAt: new Date(),
      lastError: null,
    });
    return attempt;
  });
}

export async function failAttempt(prisma: PrismaClient, attemptId: string, error: unknown) {
  const message = boundedText(error);
  return prisma.$transaction(async (tx) => {
    const attempt = await transitionAttempt(tx, attemptId, "failed", {
      completedAt: new Date(),
      error: message,
    });
    await transitionExecution(tx, attempt.executionId, "failed", {
      completedAt: new Date(),
      lastError: message,
    });
    return attempt;
  });
}

/**
 * Best-effort terminal settlement. Safe when cancel/resume already closed the attempt.
 */
export async function settleAttempt(
  prisma: PrismaClient,
  attemptId: string,
  outcome: "completed" | "failed",
  error?: unknown,
) {
  try {
    if (outcome === "completed") return await completeAttempt(prisma, attemptId);
    return await failAttempt(prisma, attemptId, error ?? "Attempt failed");
  } catch {
    return prisma.attempt.findUnique({ where: { id: attemptId } });
  }
}

export async function upsertCheckResult(
  db: Db,
  input: {
    attemptId: string;
    checkName: string;
    status: "pending" | "passed" | "failed";
    summary?: unknown;
    details?: unknown;
  },
) {
  const attempt = await db.attempt.findUniqueOrThrow({
    where: { id: input.attemptId },
    select: { runId: true, taskId: true },
  });
  const idempotencyKey = checkResultKey(input.attemptId, input.checkName);
  const data = {
    status: input.status,
    summary: boundedText(input.summary),
    details: input.details === undefined ? undefined : sanitizeExecutionData(input.details),
    completedAt: input.status === "pending" ? null : new Date(),
  };
  return db.checkResult.upsert({
    where: { idempotencyKey },
    create: {
      attemptId: input.attemptId,
      ...attempt,
      idempotencyKey,
      checkName: boundedText(input.checkName, 200) ?? "check",
      ...data,
    },
    update: data,
  });
}

export async function createApproval(
  db: Db,
  input: {
    executionId: string;
    attemptId?: string | null;
    requestId: string;
    kind: string;
    prompt: unknown;
    requestedById?: string | null;
  },
) {
  const execution = await db.execution.findUniqueOrThrow({
    where: { id: input.executionId },
    select: { runId: true, taskId: true },
  });
  const idempotencyKey = approvalKey(input.executionId, input.requestId);
  return db.approval.upsert({
    where: { idempotencyKey },
    create: {
      executionId: input.executionId,
      attemptId: input.attemptId,
      ...execution,
      idempotencyKey,
      kind: boundedText(input.kind, 200) ?? "approval",
      prompt: boundedText(input.prompt) ?? "",
      requestedById: input.requestedById,
    },
    update: {},
  });
}

export async function resolveApproval(
  db: Db,
  id: string,
  status: Exclude<ApprovalStatus, "pending">,
  input: { resolvedById?: string | null; decisionNote?: unknown } = {},
) {
  const result = await db.approval.updateMany({
    where: { id, status: "pending" },
    data: {
      status,
      resolvedById: input.resolvedById,
      decisionNote: boundedText(input.decisionNote),
      resolvedAt: new Date(),
    },
  });
  if (result.count) return db.approval.findUniqueOrThrow({ where: { id } });
  const current = await db.approval.findUniqueOrThrow({ where: { id } });
  if (current.status === status) return current;
  throw new Error(`Approval already resolved as ${current.status}`);
}

export type MilestoneProjection = {
  runId: string;
  agentId?: string | null;
  type: EventType;
  sourceKind: Exclude<RunEventSourceKind, null>;
  sourceId: string;
  payload: Record<string, unknown>;
};

export function milestoneTypeForRecord(
  sourceKind: RunEventSourceKind,
  status: string,
): EventType | null {
  const key = `${sourceKind}:${status}`;
  const types: Record<string, EventType> = {
    "execution:running": "EXECUTION_STARTED",
    "execution:completed": "EXECUTION_COMPLETED",
    "tool_event:running": "TOOL_STARTED",
    "tool_event:completed": "TOOL_COMPLETED",
    "tool_event:failed": "TOOL_FAILED",
    "check_result:passed": "CHECK_PASSED",
    "check_result:failed": "CHECK_FAILED",
    "approval:pending": "APPROVAL_REQUIRED",
    "approval:approved": "APPROVAL_RESOLVED",
    "approval:rejected": "APPROVAL_RESOLVED",
    "approval:cancelled": "APPROVAL_RESOLVED",
  };
  return types[key] ?? null;
}

/** Maps durable records to UI-safe milestones; tool output is deliberately excluded. */
export function milestoneProjection(input: MilestoneProjection): MilestoneProjection {
  const payload = sanitizeExecutionData(input.payload) as Record<string, unknown>;
  if (input.sourceKind === "tool_event") {
    delete payload.output;
    delete payload.input;
  }
  return { ...input, payload };
}

export async function projectMilestone(db: Db, input: MilestoneProjection) {
  const event = milestoneProjection(input);
  return db.runEvent.upsert({
    where: {
      runId_sourceKind_sourceId_type: {
        runId: event.runId,
        sourceKind: event.sourceKind,
        sourceId: event.sourceId,
        type: event.type,
      },
    },
    create: {
      runId: event.runId,
      agentId: event.agentId,
      type: event.type,
      sourceKind: event.sourceKind,
      sourceId: event.sourceId,
      payload: event.payload as Prisma.InputJsonValue,
    },
    update: { agentId: event.agentId, payload: event.payload as Prisma.InputJsonValue },
  });
}

export async function resetExecutionsForRun(prisma: PrismaClient, runId: string) {
  const now = new Date();
  return prisma.$transaction([
    prisma.toolEvent.updateMany({
      where: { runId, status: { in: ["requested", "running"] } },
      data: { status: "failed", error: "Interrupted by run resume", completedAt: now },
    }),
    prisma.approval.updateMany({
      where: { runId, status: "pending" },
      data: { status: "cancelled", decisionNote: "Cancelled by run resume", resolvedAt: now },
    }),
    prisma.attempt.updateMany({
      where: { runId, status: { in: ["starting", "running"] } },
      data: { status: "cancelled", error: "Interrupted by run resume", completedAt: now },
    }),
    prisma.execution.updateMany({
      where: { runId, status: { in: ["running", "paused", "failed", "cancelled"] } },
      data: {
        status: "pending",
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        lastError: null,
      },
    }),
  ]);
}

export async function cancelExecutionsForRun(prisma: PrismaClient, runId: string) {
  const now = new Date();
  return prisma.$transaction([
    prisma.toolEvent.updateMany({
      where: { runId, status: { in: ["requested", "running"] } },
      data: { status: "failed", error: "Cancelled with run", completedAt: now },
    }),
    prisma.approval.updateMany({
      where: { runId, status: "pending" },
      data: { status: "cancelled", decisionNote: "Cancelled with run", resolvedAt: now },
    }),
    prisma.attempt.updateMany({
      where: { runId, status: { in: ["starting", "running"] } },
      data: { status: "cancelled", error: "Cancelled with run", completedAt: now },
    }),
    prisma.execution.updateMany({
      where: { runId, status: { in: ["pending", "running", "paused", "failed"] } },
      data: { status: "cancelled", cancelledAt: now, completedAt: now },
    }),
  ]);
}
