import { NextResponse } from "next/server";
import { AuthError, assertRunAccess, requireProductSession } from "@/lib/auth";
import { createPreviewToken, SHARE_PREVIEW_TOKEN_TTL_SECONDS } from "@/lib/preview-token";
import { resolvePreviewOrigins } from "@/lib/preview-origin";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

function authErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json(
      { error: err.message },
      { status: err.message === "Unauthorized" ? 401 : 404 },
    );
  }
  throw err;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const session = await requireProductSession();
    const { runId } = await params;
    await assertRunAccess(runId, session);
    const limit = await consumeRateLimit({
      scope: "preview-url-user",
      identifier: session.id,
      limit: 30,
      windowMs: 60_000,
    });
    if (!limit.allowed) return rateLimitResponse(limit);

    const token = createPreviewToken(runId, Date.now(), SHARE_PREVIEW_TOKEN_TTL_SECONDS);
    const { previewOrigin } = resolvePreviewOrigins(req.url);
    const url = new URL(`/api/previews/${token}/`, previewOrigin).toString();

    return NextResponse.json(
      { url },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      },
    );
  } catch (err) {
    return authErrorResponse(err);
  }
}
