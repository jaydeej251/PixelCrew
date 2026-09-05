import { NextResponse } from "next/server";
import { ProviderType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { applyTemplate } from "@/lib/seed";
import { POSITIONS } from "@/lib/constants";
import { createHiredAgent, isPositionKey } from "@/lib/hire";
import type { PositionKey } from "@/lib/constants";
import { TEAM_TEMPLATES } from "@/lib/templates";
import { AuthError, assertWorkspaceAccess, requireProductSession } from "@/lib/auth";

const workspaceMutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("apply_template"),
    templateId: z.enum(
      TEAM_TEMPLATES.map((template) => template.id) as [string, ...string[]],
    ),
  }).strict(),
  z.object({
    action: z.literal("hire"),
    position: z.enum(Object.keys(POSITIONS) as [PositionKey, ...PositionKey[]]),
    name: z.string().trim().min(1).max(100),
    jobBoundary: z.string().trim().min(1).max(2_000).optional(),
    provider: z.nativeEnum(ProviderType).default("mock"),
    model: z.string().trim().min(1).max(200).default("mock"),
  }).strict(),
  z.object({
    action: z.literal("update_goal"),
    ceoGoal: z.string().trim().max(20_000),
  }).strict(),
]);

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
    const session = await requireProductSession();
    const { workspaceId } = await params;
    await assertWorkspaceAccess(workspaceId, session);
    const parsed = workspaceMutationSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid workspace action" }, { status: 400 });
    }
    const body = parsed.data;

  if (body.action === "apply_template") {
    await applyTemplate(workspaceId, body.templateId);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "hire") {
    const position = body.position;
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
