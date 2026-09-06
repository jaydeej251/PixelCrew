import { NextResponse } from "next/server";
import { normalizePath } from "@/lib/project-files";
import { assertRunAccess, requireProductSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api-error";
import { createPreviewToken } from "@/lib/preview-token";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { resolvePreviewOrigins } from "@/lib/preview-origin";


export async function GET(
  req: Request,
  { params }: { params: Promise<{ runId: string; path?: string[] }> },
) {
  try {
    const session = await requireProductSession();
    const { runId, path: segments } = await params;
    await assertRunAccess(runId, session);
    const limit = await consumeRateLimit({
      scope: "preview-token-user",
      identifier: session.id,
      limit: 60,
      windowMs: 60_000,
    });
    if (!limit.allowed) return rateLimitResponse(limit);

    const requested = segments?.length ? normalizePath(segments.join("/")) : null;
    if (segments?.length && !requested) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const token = createPreviewToken(runId);
    const { previewOrigin } = resolvePreviewOrigins(req.url);
    const encodedPath = requested
      ? requested.split("/").map(encodeURIComponent).join("/")
      : "";
    const target = new URL(`/api/previews/${token}/${encodedPath}`, previewOrigin);
    return NextResponse.redirect(target, {
      status: 307,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
