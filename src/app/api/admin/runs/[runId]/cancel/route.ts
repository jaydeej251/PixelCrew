import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { adminErrorResponse, requireAdminSession } from "@/lib/admin-api";
import { prisma } from "@/lib/db";
import { cancelExecutionsForRun } from "@/lib/execution-runtime";
import { writeAdminAuditLog } from "@/lib/platform-admin";

type RouteContext = { params: Promise<{ runId: string }> };

const CANCELABLE = new Set(["pending", "running", "paused"]);

export async function POST(_req: Request, context: RouteContext) {
  try {
    const session = await requireAdminSession();
    const { runId } = await context.params;

    const run = await prisma.run.findUnique({
      where: { id: runId },
      select: { id: true, status: true, workspaceId: true },
    });
    if (!run) throw new AuthError("Not found");

    if (!CANCELABLE.has(run.status)) {
      return NextResponse.json(
        { error: `Run is ${run.status} and cannot be cancelled` },
        { status: 400 },
      );
    }

    await cancelExecutionsForRun(prisma, runId);
    await prisma.run.update({
      where: { id: runId },
      data: { status: "cancelled" },
    });
    await prisma.agent.updateMany({
      where: { workspaceId: run.workspaceId },
      data: { status: "idle" },
    });
    await prisma.runEvent.create({
      data: {
        runId,
        type: "RUN_CANCELLED",
        payload: { message: "Cancelled by platform admin" },
      },
    });

    await writeAdminAuditLog({
      actorId: session.id,
      action: "run.cancel",
      targetType: "run",
      targetId: runId,
      meta: { previousStatus: run.status },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
