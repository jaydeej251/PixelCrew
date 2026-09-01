import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getJobBoundary, getPositionLabel } from "@/lib/templates";
import type { PositionKey } from "@/lib/constants";

const POSITION_DEPT: Record<string, string> = {
  executive: "Product",
  project_manager: "Product",
  designer: "Product",
  tech_architect: "Engineering",
  engineer: "Engineering",
  frontend_engineer: "Engineering",
  backend_engineer: "Engineering",
  qa_engineer: "QA",
};

async function ensureDepartment(workspaceId: string, name: string) {
  const existing = await prisma.department.findFirst({
    where: { workspaceId, name },
  });
  if (existing) return existing;
  return prisma.department.create({
    data: { workspaceId, name },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  const memories = await prisma.agentMemory.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json(memories);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  const body = await req.json();
  const current = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const position = (body.position as PositionKey | undefined) ?? (current.position as PositionKey);
  const positionChanged = Boolean(body.position && body.position !== current.position);

  let departmentId = current.departmentId;
  if (positionChanged) {
    const dept = await ensureDepartment(
      current.workspaceId,
      POSITION_DEPT[position] ?? "Engineering",
    );
    departmentId = dept.id;
  }

  const agent = await prisma.agent.update({
    where: { id: agentId },
    data: {
      ...(body.name && { name: String(body.name).trim() }),
      ...(body.position && {
        position,
        positionLabel: getPositionLabel(position),
      }),
      jobBoundary:
        body.jobBoundary?.trim() ||
        (positionChanged ? getJobBoundary(position) : current.jobBoundary),
      ...(body.provider && { provider: body.provider }),
      ...(body.model && { model: body.model }),
      departmentId,
    },
  });
  return NextResponse.json(agent);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  await prisma.agent.delete({ where: { id: agentId } });
  return NextResponse.json({ ok: true });
}
