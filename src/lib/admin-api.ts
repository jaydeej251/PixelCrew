import { requirePlatformRole, requireSession } from "@/lib/auth";
import type { SessionUser } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api-error";

/** Admin routes share the product JSON error contract (never empty 500 bodies). */
export function adminErrorResponse(err: unknown) {
  return apiErrorResponse(err);
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
