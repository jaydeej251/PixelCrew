import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { consumeRateLimit, rateLimitResponse, requestClientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const limit = await consumeRateLimit({
    scope: "waitlist-ip",
    identifier: requestClientIp(req),
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!limit.allowed) return rateLimitResponse(limit);

  const parsed = z
    .object({ email: z.email().trim().toLowerCase().max(320) })
    .strict()
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  const { email } = parsed.data;
  await prisma.waitlistEntry.upsert({
    where: { email },
    create: { email },
    update: {},
  });
  return NextResponse.json({ ok: true });
}
