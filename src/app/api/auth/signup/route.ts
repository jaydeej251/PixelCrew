import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, hashPassword, SESSION_COOKIE } from "@/lib/auth";
import { slugify } from "@/lib/utils";
import { createWorkspaceForUser } from "@/lib/workspace-bootstrap";
import { consumeRateLimit, rateLimitResponse, requestClientIp } from "@/lib/rate-limit";
import { persistPlatformRoleUpgrade, postAuthPath } from "@/lib/platform-admin";

const signupSchema = z.object({
  email: z.email().trim().toLowerCase().max(320),
  password: z.string().min(8).max(1_024),
  name: z.string().trim().max(100).optional(),
}).strict();

export async function POST(req: Request) {
  const limit = await consumeRateLimit({
    scope: "auth-signup-ip",
    identifier: requestClientIp(req),
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!limit.allowed) return rateLimitResponse(limit);

  const parsed = signupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Valid email and password of at least 8 characters required" },
      { status: 400 },
    );
  }
  const { email, password } = parsed.data;
  const name = parsed.data.name || null;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, name, passwordHash },
  });

  const baseSlug = slugify(name ?? email.split("@")[0] ?? "company") || "company";
  let slug = baseSlug;
  let n = 0;
  while (await prisma.organization.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${baseSlug}-${n}`;
  }

  await createWorkspaceForUser(user.id, name ? `${name}'s Company` : "My Company", slug);

  const platformRole = await persistPlatformRoleUpgrade(user.id, user.email, "none");

  const token = await createSession(user.id);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.json({
    ok: true,
    email: user.email,
    redirectTo: postAuthPath(platformRole),
  });
}
