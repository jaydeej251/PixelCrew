import { NextResponse } from "next/server";
import JSZip from "jszip";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { artifacts: true, tasks: true },
  });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const zip = new JSZip();
  zip.file("README.md", `# Run export\n\nGoal: ${run.ceoGoal}\nStatus: ${run.status}\n`);
  zip.file("tasks.json", JSON.stringify(run.tasks, null, 2));

  const artifactsFolder = zip.folder("artifacts");
  for (const a of run.artifacts) {
    const path = a.filePath ?? `${a.type}/${a.title.replace(/\s+/g, "-")}.md`;
    artifactsFolder?.file(path, `# ${a.title}\n\n${a.content}`);
  }

  const buffer = await zip.generateAsync({ type: "arraybuffer" });
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="pixelcrew-run-${runId}.zip"`,
    },
  });
}
