import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

export const SESSION_COOKIE = "pc_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  organizationId: string;
  workspaceId: string;
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

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    organizationId: membership.organizationId,
    workspaceId: workspace.id,
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

export async function assertRunAccess(runId: string, session: SessionUser) {
  const run = await prisma.run.findFirst({
    where: {
      id: runId,
      archivedAt: null,
      workspace: { organizationId: session.organizationId },
    },
    select: { id: true, workspaceId: true },
  });
  if (!run) throw new AuthError("Not found");
  return run;
}

export async function assertWorkspaceAccess(workspaceId: string, session: SessionUser) {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!workspace) throw new AuthError("Not found");
  return workspace;
}

export async function checkPlanLimits(organizationId: string): Promise<{
  canRun: boolean;
  reason?: string;
}> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) return { canRun: false, reason: "Organization not found" };

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Counts new Run rows only (new chats/goals). Resuming a stopped run does not create a row.
  const runCount = await prisma.run.count({
    where: {
      workspace: { organizationId },
      createdAt: { gte: monthStart },
    },
  });

  const limits: Record<string, number> = { free: 5, pro: 100, enterprise: 10000 };
  const limit = limits[org.plan] ?? 5;
  if (runCount >= limit) {
    return { canRun: false, reason: `Plan limit reached (${limit} runs/month)` };
  }
  return { canRun: true };
}
