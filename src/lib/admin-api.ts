import { NextResponse } from "next/server";
import { AuthError, authErrorStatus, requirePlatformRole, requireSession } from "@/lib/auth";
import type { SessionUser } from "@/lib/auth";

export function adminErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: authErrorStatus(err) });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

export async function requireAdminSession(): Promise<SessionUser> {
  const session = await requireSession();
  requirePlatformRole(session);
  return session;
}

export function monthStart(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function dayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
