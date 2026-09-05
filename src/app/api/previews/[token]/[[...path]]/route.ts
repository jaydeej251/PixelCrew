import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assembleProject,
  contentTypeFor,
  findPreviewIndex,
  normalizePath,
} from "@/lib/project-files";
import { preparePreviewAsset, preparePreviewHtml } from "@/lib/preview-html";
import { previewSecurityHeaders } from "@/lib/preview-security";
import { verifyPreviewToken } from "@/lib/preview-token";
import { resolvePreviewOrigins } from "@/lib/preview-origin";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string; path?: string[] }> },
) {
  const { appOrigin, previewOrigin } = resolvePreviewOrigins(req.url);
  if (new URL(req.url).origin !== previewOrigin) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { token, path: segments } = await params;
  const access = verifyPreviewToken(token);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const limit = await consumeRateLimit({
    scope: "preview-assets-token",
    identifier: token,
    limit: 600,
    windowMs: 60_000,
  });
  if (!limit.allowed) return rateLimitResponse(limit);

  const run = await prisma.run.findFirst({
    where: { id: access.runId, archivedAt: null },
    include: { artifacts: true },
  });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const files = assembleProject({ ceoGoal: run.ceoGoal, artifacts: run.artifacts });
  const requested =
    segments && segments.length > 0
      ? normalizePath(segments.join("/"))
      : findPreviewIndex(files);
  if (!requested || !files.has(requested)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const type = contentTypeFor(requested);
  let body = files.get(requested)!;
  let previewBaseUrl: string | undefined;
  if (type.startsWith("text/html")) {
    const basePath = `/api/previews/${token}/`;
    body = preparePreviewHtml(body, run.id, requested, basePath);
    previewBaseUrl = new URL(basePath, previewOrigin).toString();
  } else {
    body = preparePreviewAsset(body, requested, type);
  }

  return new NextResponse(body, {
    headers: previewSecurityHeaders(type, previewBaseUrl, appOrigin),
  });
}
