import { prisma } from "./db";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  organizationId: string;
};

export async function getSession(): Promise<SessionUser | null> {
  const user = await prisma.user.findFirst({
    include: { memberships: { include: { organization: true } } },
  });
  if (!user || user.memberships.length === 0) return null;
  const m = user.memberships[0];
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    organizationId: m.organizationId,
  };
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
