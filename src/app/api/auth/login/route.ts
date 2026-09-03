import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, SESSION_COOKIE, verifyPassword } from "@/lib/auth";
import { consumeRateLimit, rateLimitResponse, requestClientIp } from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.email().trim().toLowerCase().max(320),
  password: z.string().min(1).max(1_024),
}).strict();

export async function POST(req: Request) {
  const ipLimit = await consumeRateLimit({
    scope: "auth-login-ip",
    identifier: requestClientIp(req),
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (!ipLimit.allowed) return rateLimitResponse(ipLimit);

  const parsed = loginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }
  const { email, password } = parsed.data;
  const accountLimit = await consumeRateLimit({
    scope: "auth-login-account",
    identifier: email || "missing",
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (!accountLimit.allowed) return rateLimitResponse(accountLimit);

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await createSession(user.id);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.json({ ok: true, email: user.email });
}
