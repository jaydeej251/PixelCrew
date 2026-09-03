import { NextResponse } from "next/server";
import { AuthError, assertWorkspaceAccess, requireSession } from "@/lib/auth";
import { createOfficeLayout, listOfficeLayouts, restoreHqLayout } from "@/lib/office-layouts";

function authErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.message === "Unauthorized" ? 401 : 404 });
  }
  throw err;
}

export async function GET() {
  try {
    const session = await requireSession();
    const layouts = await listOfficeLayouts(session.workspaceId);
    return NextResponse.json({ layouts });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    await assertWorkspaceAccess(session.workspaceId, session);
    const body = (await req.json()) as {
      action?: string;
      name?: string;
      source?: "empty" | "hq" | "copy";
      copyId?: string;
    };
    if (body.action === "restore_hq") {
      const layout = await restoreHqLayout(session.workspaceId);
      return NextResponse.json({
        ok: true,
        id: layout.id,
        name: layout.name,
        data: layout.data,
      });
    }
    const layout = await createOfficeLayout(
      session.workspaceId,
      body.name ?? "New office",
      body.source ?? "empty",
      body.copyId,
    );
    return NextResponse.json(layout);
  } catch (err) {
    return authErrorResponse(err);
  }
}
