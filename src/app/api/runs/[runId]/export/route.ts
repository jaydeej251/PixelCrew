import { NextResponse } from "next/server";
import JSZip from "jszip";
import { prisma } from "@/lib/db";
import { assembleProject } from "@/lib/project-files";
import { AuthError, assertRunAccess, requireProductSession } from "@/lib/auth";

function authErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.message === "Unauthorized" ? 401 : 404 });
  }
  throw err;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const session = await requireProductSession();
    const { runId } = await params;
    await assertRunAccess(runId, session);

    const run = await prisma.run.findUnique({
      where: { id: runId },
      include: { artifacts: true },
    });
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const files = assembleProject({ ceoGoal: run.ceoGoal, artifacts: run.artifacts });
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
