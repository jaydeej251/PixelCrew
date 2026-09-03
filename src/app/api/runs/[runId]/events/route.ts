import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  AuthError,
  assertRunAccess,
  authErrorStatus,
  requireSession,
} from "@/lib/auth";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  let runId: string;
  try {
    const session = await requireSession();
    ({ runId } = await params);
    await assertRunAccess(runId, session);
    const limit = await consumeRateLimit({
      scope: "sse-user",
      identifier: session.id,
      limit: 30,
      windowMs: 60_000,
    });
    if (!limit.allowed) return rateLimitResponse(limit);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: authErrorStatus(err) });
    }
    throw err;
  }

  const encoder = new TextEncoder();
  let lastCreatedAt: Date | null = null;
  let lastId = "";

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let interval: ReturnType<typeof setInterval> | null = null;

      const safeClose = () => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        try {
          controller.close();
        } catch {
          // Stream already closed (e.g. client navigated away)
        }
      };

      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          safeClose();
        }
      };

      const poll = async (): Promise<boolean> => {
        if (closed) return true;

        const events = await prisma.runEvent.findMany({
          where: {
            runId,
            ...(lastCreatedAt
              ? {
                  OR: [
                    { createdAt: { gt: lastCreatedAt } },
                    { createdAt: lastCreatedAt, id: { gt: lastId } },
                  ],
                }
              : {}),
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });

        for (const e of events) {
          send({
            id: e.id,
            type: e.type,
            payload: e.payload,
            agentId: e.agentId,
            sourceKind: e.sourceKind,
            sourceId: e.sourceId,
            createdAt: e.createdAt.toISOString(),
          });
          lastCreatedAt = e.createdAt;
          lastId = e.id;
        }

        const run = await prisma.run.findUnique({ where: { id: runId } });
        if (run && ["completed", "cancelled", "failed", "paused"].includes(run.status)) {
          send({ type: "STREAM_END", runStatus: run.status });
          safeClose();
          return true;
        }

        return false;
      };

      try {
        const done = await poll();
        if (done || closed) return;

        interval = setInterval(async () => {
          try {
            const finished = await poll();
            if (finished) safeClose();
          } catch (err) {
            console.warn("[PixelCrew] SSE poll error:", err);
            safeClose();
          }
        }, 800);
      } catch (err) {
        console.warn("[PixelCrew] SSE start error:", err);
        safeClose();
      }

      req.signal.addEventListener("abort", safeClose);
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
