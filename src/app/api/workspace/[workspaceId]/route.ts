import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { applyTemplate } from "@/lib/seed";
import { AVATAR_COLORS } from "@/lib/constants";
import { getJobBoundary, getPositionLabel } from "@/lib/templates";
import type { PositionKey } from "@/lib/constants";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const body = await req.json();

  if (body.action === "apply_template") {
    await applyTemplate(workspaceId, body.templateId);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "hire") {
    const desks = await prisma.desk.findMany({ where: { workspaceId } });
    const count = await prisma.agent.count({ where: { workspaceId } });
    const desk = desks[count % desks.length];
    const position = body.position as PositionKey;

    const agent = await prisma.agent.create({
      data: {
        name: body.name,
        position,
        positionLabel: getPositionLabel(position),
        jobBoundary: body.jobBoundary ?? getJobBoundary(position),
        avatarColor: AVATAR_COLORS[count % AVATAR_COLORS.length],
        workspaceId,
        deskId: desk?.id,
        provider: body.provider ?? "mock",
        model: body.model ?? "mock",
      },
    });
    return NextResponse.json(agent);
  }

  if (body.action === "update_goal") {
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { ceoGoal: body.ceoGoal },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
