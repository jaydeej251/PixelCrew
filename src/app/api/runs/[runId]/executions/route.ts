import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertRunAccess, requireProductSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api-error";
import { boundedText } from "@/lib/execution-runtime";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const MAX_ATTEMPTS = 50;
const MAX_NESTED = 50;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const session = await requireProductSession();
    const { runId } = await params;
    await assertRunAccess(runId, session);

    const limit = await consumeRateLimit({
      scope: "run-executions",
      identifier: session.id,
      limit: 60,
      windowMs: 60_000,
    });
    if (!limit.allowed) return rateLimitResponse(limit);

    const executions = await prisma.execution.findMany({
      where: { runId },
      orderBy: { createdAt: "asc" },
      include: {
        attempts: {
          orderBy: { sequence: "asc" },
          take: MAX_ATTEMPTS,
          include: {
            toolEvents: {
              orderBy: { sequence: "asc" },
              take: MAX_NESTED,
            },
            checkResults: {
              orderBy: { createdAt: "asc" },
              take: MAX_NESTED,
            },
          },
        },
        approvals: {
          orderBy: { createdAt: "asc" },
          take: MAX_NESTED,
        },
      },
    });

    return NextResponse.json({
      executions: executions.map((execution) => ({
        id: execution.id,
        runId: execution.runId,
        taskId: execution.taskId,
        agentId: execution.agentId,
        status: execution.status,
        attemptCounter: execution.attemptCounter,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        cancelledAt: execution.cancelledAt,
        lastError: boundedText(execution.lastError),
        createdAt: execution.createdAt,
        updatedAt: execution.updatedAt,
        attempts: execution.attempts.map((attempt) => ({
          id: attempt.id,
          sequence: attempt.sequence,
          status: attempt.status,
          agentId: attempt.agentId,
          workspaceKey: attempt.workspaceKey,
          startedAt: attempt.startedAt,
          completedAt: attempt.completedAt,
          error: boundedText(attempt.error),
          createdAt: attempt.createdAt,
          toolEvents: attempt.toolEvents.map((tool) => ({
            id: tool.id,
            sequence: tool.sequence,
            toolName: tool.toolName,
            status: tool.status,
            // Bodies stay on durable rows; inspection API omits them until sandbox tooling ships.
            error: boundedText(tool.error),
            startedAt: tool.startedAt,
            completedAt: tool.completedAt,
            createdAt: tool.createdAt,
          })),
          checkResults: attempt.checkResults.map((check) => ({
            id: check.id,
            checkName: check.checkName,
            status: check.status,
            summary: boundedText(check.summary),
            completedAt: check.completedAt,
            createdAt: check.createdAt,
          })),
        })),
        approvals: execution.approvals.map((approval) => ({
          id: approval.id,
          attemptId: approval.attemptId,
          status: approval.status,
          kind: approval.kind,
          prompt: boundedText(approval.prompt),
          decisionNote: boundedText(approval.decisionNote),
          requestedById: approval.requestedById,
          resolvedById: approval.resolvedById,
          resolvedAt: approval.resolvedAt,
          createdAt: approval.createdAt,
        })),
      })),
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
