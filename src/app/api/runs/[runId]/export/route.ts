import { NextResponse } from "next/server";
import JSZip from "jszip";
import { prisma } from "@/lib/db";
import { assembleProject, assembleSingleFileHtml } from "@/lib/project-files";
import { AuthError, assertRunAccess, requireProductSession } from "@/lib/auth";

function authErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.message === "Unauthorized" ? 401 : 404 });
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
    const format = new URL(req.url).searchParams.get("format");

    const run = await prisma.run.findUnique({
      where: { id: runId },
      include: { artifacts: true },
    });
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const files = assembleProject({ ceoGoal: run.ceoGoal, artifacts: run.artifacts });

    if (format === "single") {
      const html = assembleSingleFileHtml(files, run.ceoGoal);
      if (!html) {
        return NextResponse.json({ error: "No previewable HTML to export" }, { status: 404 });
      }
      const slug = run.ceoGoal.trim().slice(0, 40).replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
      const filename = slug ? `pixelcrew-${slug}.html` : `pixelcrew-app-${runId.slice(0, 8)}.html`;
      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, no-store, max-age=0",
        },
      });
    }

    const zip = new JSZip();
    for (const [path, content] of files) {
      zip.file(path, content);
    }

    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="pixelcrew-run-${runId}.zip"`,
      },
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}
