import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assembleProject,
  contentTypeFor,
  findPreviewIndex,
  injectBaseHref,
  normalizePath,
} from "@/lib/project-files";
import { AuthError, assertRunAccess, requireSession } from "@/lib/auth";

function authErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.message === "Unauthorized" ? 401 : 404 });
  }
  throw err;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string; path?: string[] }> },
) {
  try {
    const session = await requireSession();
    const { runId, path: segments } = await params;
    await assertRunAccess(runId, session);

    const run = await prisma.run.findUnique({
      where: { id: runId },
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

    let body = files.get(requested)!;
    const type = contentTypeFor(requested);
    if (type.startsWith("text/html")) {
      body = injectBaseHref(body, runId, requested);
    }

    return new NextResponse(body, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}
