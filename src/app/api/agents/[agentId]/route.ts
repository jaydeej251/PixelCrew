import { NextResponse } from "next/server";
import { ProviderType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getJobBoundary, getPositionLabel } from "@/lib/templates";
import { POSITIONS, type PositionKey } from "@/lib/constants";
import {
  AuthError,
  assertAgentAccess,
  authErrorStatus,
  requireSession,
} from "@/lib/auth";

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

const updateAgentSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    position: z.enum(Object.keys(POSITIONS) as [PositionKey, ...PositionKey[]]).optional(),
    jobBoundary: z.string().trim().min(1).max(2_000).optional(),
    provider: z.nativeEnum(ProviderType).optional(),
    model: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

function errorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: authErrorStatus(err) });
  }
  throw err;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const session = await requireSession();
    const { agentId } = await params;
    await assertAgentAccess(agentId, session);
    const memories = await prisma.agentMemory.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json(memories);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const session = await requireSession();
    const { agentId } = await params;
    await assertAgentAccess(agentId, session);
    const parsed = updateAgentSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid agent update", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const current = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = parsed.data;
    const position = body.position ?? (current.position as PositionKey);
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
        ...(body.name !== undefined && { name: body.name }),
        ...(body.position !== undefined && {
          position,
          positionLabel: getPositionLabel(position),
        }),
        jobBoundary:
          body.jobBoundary ??
          (positionChanged ? getJobBoundary(position) : current.jobBoundary),
        ...(body.provider !== undefined && { provider: body.provider }),
        ...(body.model !== undefined && { model: body.model }),
        departmentId,
      },
    });
    return NextResponse.json(agent);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const session = await requireSession();
    const { agentId } = await params;
    await assertAgentAccess(agentId, session);
    await prisma.agent.delete({ where: { id: agentId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
