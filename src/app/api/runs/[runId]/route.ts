import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { cancelExecutionsForRun } from "@/lib/execution-runtime";
import {
  AuthError,
  assertRunAccess,
  requireSession,
} from "@/lib/auth";

const updateRunSchema = z
  .object({
    title: z.string().trim().max(120).optional(),
    archive: z.literal(true).optional(),
  })
  .strict()
  .refine((value) => value.title !== undefined || value.archive === true);

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

    const parsed = updateRunSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid run update" }, { status: 400 });
    }
    const body = parsed.data;
    const data: { title?: string; archivedAt?: Date | null } = {};

    if (typeof body.title === "string") {
      data.title = body.title;
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

    const run = await prisma.run.findUnique({
      where: { id: runId },
      select: { status: true, workspaceId: true },
    });
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (run.status === "running" || run.status === "pending") {
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
        data: { runId, type: "RUN_CANCELLED", payload: { message: "Stopped by you" } },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}
