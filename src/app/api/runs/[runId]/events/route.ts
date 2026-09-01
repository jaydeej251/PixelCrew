import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const encoder = new TextEncoder();
  let lastId: string | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const poll = async () => {
        const events = await prisma.runEvent.findMany({
          where: {
            runId,
            ...(lastId ? { createdAt: { gt: (await prisma.runEvent.findUnique({ where: { id: lastId } }))?.createdAt ?? new Date(0) } } : {}),
          },
          orderBy: { createdAt: "asc" },
        });

        for (const e of events) {
          send({
            id: e.id,
            type: e.type,
            payload: e.payload,
            agentId: e.agentId,
            createdAt: e.createdAt.toISOString(),
          });
          lastId = e.id;
        }

        const run = await prisma.run.findUnique({ where: { id: runId } });
        if (run && ["completed", "cancelled", "failed"].includes(run.status)) {
          send({ type: "STREAM_END", runStatus: run.status });
          controller.close();
          return;
        }
      };

      await poll();
      const interval = setInterval(async () => {
        try {
          await poll();
        } catch {
          clearInterval(interval);
          controller.close();
        }
      }, 800);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
