import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { applyTemplate } from "@/lib/seed";
import { POSITIONS } from "@/lib/constants";
import { createHiredAgent, isPositionKey } from "@/lib/hire";
import type { PositionKey } from "@/lib/constants";
import { AuthError, assertWorkspaceAccess, requireSession } from "@/lib/auth";

function authErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.message === "Unauthorized" ? 401 : 404 });
  }
  throw err;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const session = await requireSession();
    const { workspaceId } = await params;
    await assertWorkspaceAccess(workspaceId, session);
    const body = await req.json();

  if (body.action === "apply_template") {
    await applyTemplate(workspaceId, body.templateId);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "hire") {
    const position = body.position as PositionKey;
    if (!isPositionKey(position) || !(position in POSITIONS)) {
      return NextResponse.json({ error: "Invalid position" }, { status: 400 });
    }
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    try {
      const agent = await createHiredAgent({
        workspaceId,
        position,
        name,
        jobBoundary: body.jobBoundary,
        provider: body.provider ?? "mock",
        model: body.model ?? "mock",
      });
      return NextResponse.json(agent);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Hire failed" },
        { status: 400 },
      );
    }
  }

  if (body.action === "update_goal") {
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { ceoGoal: body.ceoGoal },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return authErrorResponse(err);
  }
}
