-- Extend the existing activity stream without rewriting legacy rows.
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'EXECUTION_STARTED';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'TOOL_STARTED';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'TOOL_COMPLETED';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'TOOL_FAILED';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'CHECK_PASSED';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'CHECK_FAILED';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'APPROVAL_REQUIRED';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'APPROVAL_RESOLVED';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'DIFF_READY';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'EXECUTION_COMPLETED';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'SANDBOX_TERMINATED';

CREATE TYPE "ExecutionStatus" AS ENUM ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled');
CREATE TYPE "AttemptStatus" AS ENUM ('starting', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE "ToolEventStatus" AS ENUM ('requested', 'running', 'completed', 'failed');
CREATE TYPE "CheckStatus" AS ENUM ('pending', 'passed', 'failed');
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
CREATE TYPE "RunEventSourceKind" AS ENUM ('execution', 'attempt', 'tool_event', 'check_result', 'approval');

ALTER TABLE "RunEvent"
  ADD COLUMN "sourceKind" "RunEventSourceKind",
  ADD COLUMN "sourceId" TEXT;

CREATE TABLE "Execution" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "agentId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "status" "ExecutionStatus" NOT NULL DEFAULT 'pending',
  "attemptCounter" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "lastError" VARCHAR(8000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Execution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Attempt" (
  "id" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "agentId" TEXT,
  "sequence" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "AttemptStatus" NOT NULL DEFAULT 'starting',
  "workspaceKey" VARCHAR(512),
  "toolSequenceCounter" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "error" VARCHAR(8000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ToolEvent" (
  "id" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "toolName" VARCHAR(200) NOT NULL,
  "status" "ToolEventStatus" NOT NULL DEFAULT 'requested',
  "input" JSONB,
  "output" JSONB,
  "error" VARCHAR(8000),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ToolEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ToolEvent_input_size" CHECK ("input" IS NULL OR octet_length("input"::text) <= 32768),
  CONSTRAINT "ToolEvent_output_size" CHECK ("output" IS NULL OR octet_length("output"::text) <= 32768)
);

CREATE TABLE "CheckResult" (
  "id" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "checkName" VARCHAR(200) NOT NULL,
  "status" "CheckStatus" NOT NULL DEFAULT 'pending',
  "summary" VARCHAR(8000),
  "details" JSONB,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CheckResult_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CheckResult_details_size" CHECK ("details" IS NULL OR octet_length("details"::text) <= 32768)
);

CREATE TABLE "Approval" (
  "id" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "attemptId" TEXT,
  "runId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
  "kind" VARCHAR(200) NOT NULL,
  "prompt" VARCHAR(8000) NOT NULL,
  "decisionNote" VARCHAR(8000),
  "requestedById" TEXT,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RunEvent_runId_sourceKind_sourceId_type_key"
  ON "RunEvent"("runId", "sourceKind", "sourceId", "type");
CREATE UNIQUE INDEX "Execution_taskId_key" ON "Execution"("taskId");
CREATE UNIQUE INDEX "Execution_idempotencyKey_key" ON "Execution"("idempotencyKey");
CREATE INDEX "Execution_runId_status_idx" ON "Execution"("runId", "status");
CREATE UNIQUE INDEX "Attempt_idempotencyKey_key" ON "Attempt"("idempotencyKey");
CREATE UNIQUE INDEX "Attempt_executionId_sequence_key" ON "Attempt"("executionId", "sequence");
CREATE INDEX "Attempt_runId_status_idx" ON "Attempt"("runId", "status");
CREATE UNIQUE INDEX "ToolEvent_idempotencyKey_key" ON "ToolEvent"("idempotencyKey");
CREATE UNIQUE INDEX "ToolEvent_attemptId_sequence_key" ON "ToolEvent"("attemptId", "sequence");
CREATE INDEX "ToolEvent_runId_status_idx" ON "ToolEvent"("runId", "status");
CREATE UNIQUE INDEX "CheckResult_idempotencyKey_key" ON "CheckResult"("idempotencyKey");
CREATE INDEX "CheckResult_runId_status_idx" ON "CheckResult"("runId", "status");
CREATE UNIQUE INDEX "Approval_idempotencyKey_key" ON "Approval"("idempotencyKey");
CREATE INDEX "Approval_runId_status_idx" ON "Approval"("runId", "status");

ALTER TABLE "Execution" ADD CONSTRAINT "Execution_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_executionId_fkey"
  FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ToolEvent" ADD CONSTRAINT "ToolEvent_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ToolEvent" ADD CONSTRAINT "ToolEvent_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ToolEvent" ADD CONSTRAINT "ToolEvent_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckResult" ADD CONSTRAINT "CheckResult_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckResult" ADD CONSTRAINT "CheckResult_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckResult" ADD CONSTRAINT "CheckResult_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_executionId_fkey"
  FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
