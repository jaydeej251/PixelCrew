import type { PlatformRole, Prisma } from "@prisma/client";
import { prisma } from "./db";

export const PLATFORM_OPS_ROLES: readonly PlatformRole[] = ["ops", "owner"];

export function parsePlatformAdminEmails(
  raw: string | undefined = process.env.PLATFORM_ADMIN_EMAILS,
): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPlatformAdminEmail(
  email: string,
  allowlist: Set<string> = parsePlatformAdminEmails(),
): boolean {
  return allowlist.has(email.trim().toLowerCase());
}

/** Effective platform role after allowlist bootstrap (ops if listed and currently none). */
export function resolvePlatformRole(
  email: string,
  stored: PlatformRole,
  allowlist: Set<string> = parsePlatformAdminEmails(),
): PlatformRole {
  if (stored === "ops" || stored === "owner") return stored;
  if (isPlatformAdminEmail(email, allowlist)) return "ops";
  return stored;
}

export async function persistPlatformRoleUpgrade(
  userId: string,
  email: string,
  stored: PlatformRole,
): Promise<PlatformRole> {
  const effective = resolvePlatformRole(email, stored);
  if (effective === "ops" && stored === "none") {
    await prisma.user.update({
      where: { id: userId },
      data: { platformRole: "ops" },
    });
  }
  return effective;
}

export function isPlatformOps(role: PlatformRole): boolean {
  return PLATFORM_OPS_ROLES.includes(role);
}

export async function writeAdminAuditLog(input: {
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  meta?: Prisma.InputJsonValue | null;
}): Promise<void> {
  await prisma.adminAuditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      meta: input.meta ?? undefined,
    },
  });
}
