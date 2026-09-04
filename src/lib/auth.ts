import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import type { MembershipRole, PlatformRole } from "@prisma/client";
import { prisma } from "./db";
import { agentAccessWhere, runAccessWhere, workspaceAccessWhere } from "./access";
import { FREE_RUNS_PER_MONTH } from "./constants";
import { persistPlatformRoleUpgrade, PLATFORM_OPS_ROLES } from "./platform-admin";

export const SESSION_COOKIE = "pc_session";
const SESSION_DAYS = 30;

const PLAN_RUN_LIMITS: Record<string, number> = {
  free: FREE_RUNS_PER_MONTH,
  pro: 100,
  enterprise: 10_000,
};

export type PlanUsage = {
  canRun: boolean;
  reason?: string;
  used: number;
  limit: number;
  plan: string;
};

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  organizationId: string;
  workspaceId: string;
  role: MembershipRole;
  platformRole: PlatformRole;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function deriveRunTitle(ceoGoal: string): string {
  const trimmed = ceoGoal.trim().replace(/\s+/g, " ");
  if (!trimmed) return "New conversation";
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);

  await prisma.session.create({
    data: { userId, tokenHash, expiresAt },
  });

  return token;
}

export async function deleteSession(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await prisma.session.deleteMany({ where: { tokenHash } });
}

export async function getSessionFromToken(token: string): Promise<SessionUser | null> {
  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          memberships: {
            include: {
              organization: { include: { workspaces: { take: 1, orderBy: { createdAt: "asc" } } } },
            },
          },
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  const membership = session.user.memberships[0];
  const workspace = membership?.organization.workspaces[0];
  if (!membership || !workspace) return null;

  const platformRole = await persistPlatformRoleUpgrade(
    session.user.id,
    session.user.email,
    session.user.platformRole,
  );

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    organizationId: membership.organizationId,
    workspaceId: workspace.id,
    role: membership.role,
    platformRole,
  };
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionFromToken(token);
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AuthError("Unauthorized");
  return session;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export function authErrorStatus(error: AuthError): 401 | 403 | 404 {
  if (error.message === "Unauthorized") return 401;
  if (error.message === "Forbidden") return 403;
  return 404;
}

export async function assertRunAccess(runId: string, session: SessionUser) {
  const run = await prisma.run.findFirst({
    where: runAccessWhere(runId, session),
    select: { id: true, workspaceId: true },
  });
  if (!run) throw new AuthError("Not found");
  return run;
}

export async function assertWorkspaceAccess(workspaceId: string, session: SessionUser) {
  const workspace = await prisma.workspace.findFirst({
    where: workspaceAccessWhere(workspaceId, session),
    select: { id: true },
  });
  if (!workspace) throw new AuthError("Not found");
  return workspace;
}

export async function assertAgentAccess(agentId: string, session: SessionUser) {
  const agent = await prisma.agent.findFirst({
    where: agentAccessWhere(agentId, session),
    select: { id: true, workspaceId: true },
  });
  if (!agent) throw new AuthError("Not found");
  return agent;
}

export function requireOrganizationRole(
  session: SessionUser,
  allowedRoles: readonly MembershipRole[],
): void {
  if (!allowedRoles.includes(session.role)) {
    throw new AuthError("Forbidden");
  }
}

/** Throws Not found (404) so non-admins cannot discover the admin surface. */
export function requirePlatformRole(
  session: SessionUser,
  allowed: readonly PlatformRole[] = PLATFORM_OPS_ROLES,
): void {
  if (!allowed.includes(session.platformRole)) {
    throw new AuthError("Not found");
  }
}

export async function getPlanUsage(organizationId: string): Promise<PlanUsage> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) {
    return { canRun: false, reason: "Organization not found", used: 0, limit: 0, plan: "free" };
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Counts new Run rows only (new chats/goals). Resuming a stopped run does not create a row.
  const used = await prisma.run.count({
    where: {
      workspace: { organizationId },
      createdAt: { gte: monthStart },
    },
  });

  const limit = PLAN_RUN_LIMITS[org.plan] ?? FREE_RUNS_PER_MONTH;
  if (used >= limit) {
    return {
      canRun: false,
      reason: `Free beta limit reached (${limit} runs/month). Resume existing chats anytime.`,
      used,
      limit,
      plan: org.plan,
    };
  }
  return { canRun: true, used, limit, plan: org.plan };
}

export async function checkPlanLimits(organizationId: string): Promise<{
  canRun: boolean;
  reason?: string;
}> {
  const usage = await getPlanUsage(organizationId);
  return { canRun: usage.canRun, reason: usage.reason };
}
