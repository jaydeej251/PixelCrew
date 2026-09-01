import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
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
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  await prisma.run.update({
    where: { id: runId },
    data: { status: "cancelled" },
  });
  await prisma.runEvent.create({
    data: { runId, type: "RUN_CANCELLED", payload: {} },
  });
  return NextResponse.json({ ok: true });
}
