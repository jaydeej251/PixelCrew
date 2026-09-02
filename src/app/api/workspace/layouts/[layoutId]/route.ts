import { NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth";
import {
  activateOfficeLayout,
  deleteOfficeLayout,
  restoreHqLayout,
  saveOfficeLayout,
} from "@/lib/office-layouts";

function authErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.message === "Unauthorized" ? 401 : 404 });
  }
  throw err;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ layoutId: string }> },
) {
  try {
    const session = await requireSession();
    const { layoutId } = await params;
    const body = (await req.json()) as { action?: string; name?: string; data?: unknown };
    if (body.action === "activate") {
      const row = await activateOfficeLayout(session.workspaceId, layoutId);
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "restore_hq") {
      const layout = await restoreHqLayout(session.workspaceId);
      return NextResponse.json({ ok: true, id: layout.id, name: layout.name, data: layout.data });
    }
    const row = await saveOfficeLayout(session.workspaceId, layoutId, body.name, body.data);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, id: row.id, name: row.name });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ layoutId: string }> },
) {
  try {
    const session = await requireSession();
    const { layoutId } = await params;
    const result = await deleteOfficeLayout(session.workspaceId, layoutId);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.error === "Not found" ? 404 : 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}
