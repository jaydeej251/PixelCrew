import { NextResponse } from "next/server";
import { normalizePath } from "@/lib/project-files";
import { AuthError, assertRunAccess, requireSession } from "@/lib/auth";
import { createPreviewToken } from "@/lib/preview-token";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { resolvePreviewOrigins } from "@/lib/preview-origin";

function authErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.message === "Unauthorized" ? 401 : 404 });
  }
  throw err;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ runId: string; path?: string[] }> },
) {
  try {
    const session = await requireSession();
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
    return authErrorResponse(err);
  }
}
