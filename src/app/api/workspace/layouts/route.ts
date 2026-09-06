import { NextResponse } from "next/server";
import { z } from "zod";
import { assertWorkspaceAccess, requireProductSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api-error";
import {
  createOfficeLayout,
  listOfficeLayouts,
  restoreHqLayout,
} from "@/lib/office-layouts";

const createLayoutSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("restore_hq") }).strict(),
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(1).max(48),
    source: z.enum(["empty", "hq", "copy"]).default("empty"),
    copyId: z.string().trim().min(1).max(100).optional(),
  }).strict().refine((value) => value.source !== "copy" || value.copyId, {
    message: "copyId is required when copying a layout",
  }),
]);

export async function GET() {
  try {
    const session = await requireProductSession();
    await assertWorkspaceAccess(session.workspaceId, session);
    return NextResponse.json({ layouts: await listOfficeLayouts(session.workspaceId) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireProductSession();
    await assertWorkspaceAccess(session.workspaceId, session);
    const parsed = createLayoutSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid layout action" }, { status: 400 });
    }
    if (parsed.data.action === "restore_hq") {
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
      parsed.data.name,
      parsed.data.source,
      parsed.data.copyId,
    );
    if (!layout) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(layout, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
