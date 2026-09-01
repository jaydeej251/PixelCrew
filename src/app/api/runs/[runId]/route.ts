import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  AuthError,
  assertRunAccess,
  assertWorkspaceAccess,
  requireSession,
} from "@/lib/auth";

function authErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.message === "Unauthorized" ? 401 : 404 });
  }
  throw err;
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
      include: {
        tasks: true,
        events: { orderBy: { createdAt: "asc" } },
        artifacts: true,
      },
    });
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(run);
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const session = await requireSession();
    const { runId } = await params;
    await assertRunAccess(runId, session);

    const body = await req.json();
    const data: { title?: string; archivedAt?: Date | null } = {};

    if (typeof body.title === "string") {
      data.title = body.title.trim().slice(0, 120);
    }
    if (body.archive === true) {
      data.archivedAt = new Date();
    }

    const run = await prisma.run.update({
      where: { id: runId },
      data,
      select: {
        id: true,
        title: true,
        ceoGoal: true,
        status: true,
        archivedAt: true,
        createdAt: true,
      },
    });
    return NextResponse.json(run);
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const session = await requireSession();
    const { runId } = await params;
    await assertRunAccess(runId, session);

    const run = await prisma.run.findUnique({ where: { id: runId }, select: { status: true } });
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (run.status === "running" || run.status === "pending") {
      await prisma.run.update({
        where: { id: runId },
        data: { status: "cancelled" },
      });
      await prisma.runEvent.create({
        data: { runId, type: "RUN_CANCELLED", payload: {} },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}
