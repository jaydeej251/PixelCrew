import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthError,
  assertWorkspaceAccess,
  authErrorStatus,
  requireProductSession,
} from "@/lib/auth";
import {
  activateOfficeLayout,
  deleteOfficeLayout,
  restoreHqLayout,
  saveOfficeLayout,
} from "@/lib/office-layouts";
import { prisma } from "@/lib/db";

const updateLayoutSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activate") }).strict(),
  z.object({ action: z.literal("restore_hq") }).strict(),
  z.object({
    action: z.literal("save"),
    name: z.string().trim().min(1).max(48).optional(),
    data: z.unknown(),
  }).strict(),
]);

function errorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: authErrorStatus(error) });
  }
  throw error;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ layoutId: string }> },
) {
  try {
    const session = await requireProductSession();
    await assertWorkspaceAccess(session.workspaceId, session);
    const { layoutId } = await params;
    const scopedLayout = await prisma.officeLayout.findFirst({
      where: { id: layoutId, workspace: { organizationId: session.organizationId } },
      select: { id: true, workspaceId: true, isProtected: true, name: true },
    });
    if (!scopedLayout || scopedLayout.workspaceId !== session.workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const parsed = updateLayoutSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid layout update" }, { status: 400 });
    }
    if (parsed.data.action === "activate") {
      const layout = await activateOfficeLayout(session.workspaceId, layoutId);
      if (!layout) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    if (parsed.data.action === "restore_hq") {
      if (!scopedLayout.isProtected && scopedLayout.name.toLowerCase() !== "hq") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const layout = await restoreHqLayout(session.workspaceId);
      return NextResponse.json({ ok: true, id: layout.id, name: layout.name, data: layout.data });
    }
    const layout = await saveOfficeLayout(
      session.workspaceId,
      layoutId,
      parsed.data.name,
      parsed.data.data,
    );
    if (!layout) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, id: layout.id, name: layout.name });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ layoutId: string }> },
) {
  try {
    const session = await requireProductSession();
    await assertWorkspaceAccess(session.workspaceId, session);
    const { layoutId } = await params;
    const scopedLayout = await prisma.officeLayout.findFirst({
      where: { id: layoutId, workspace: { organizationId: session.organizationId } },
      select: { id: true, workspaceId: true },
    });
    if (!scopedLayout || scopedLayout.workspaceId !== session.workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const result = await deleteOfficeLayout(session.workspaceId, layoutId);
    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === "Not found" ? 404 : 400 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
