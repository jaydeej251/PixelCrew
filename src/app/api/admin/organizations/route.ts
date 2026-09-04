import { NextResponse } from "next/server";
import { adminErrorResponse, monthStart, requireAdminSession } from "@/lib/admin-api";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await requireAdminSession();
    const startOfMonth = monthStart();

    const organizations = await prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        createdAt: true,
        _count: { select: { memberships: true, workspaces: true } },
      },
    });

    const runCounts = await prisma.run.groupBy({
      by: ["workspaceId"],
      where: { createdAt: { gte: startOfMonth } },
      _count: { _all: true },
    });

    const workspaces = await prisma.workspace.findMany({
      where: { id: { in: runCounts.map((r) => r.workspaceId) } },
      select: { id: true, organizationId: true },
    });
    const workspaceOrg = new Map(workspaces.map((w) => [w.id, w.organizationId]));
    const runsByOrg = new Map<string, number>();
    for (const row of runCounts) {
      const orgId = workspaceOrg.get(row.workspaceId);
      if (!orgId) continue;
      runsByOrg.set(orgId, (runsByOrg.get(orgId) ?? 0) + row._count._all);
    }

    return NextResponse.json({
      organizations: organizations.map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        createdAt: org.createdAt,
        memberCount: org._count.memberships,
        workspaceCount: org._count.workspaces,
        runsThisMonth: runsByOrg.get(org.id) ?? 0,
      })),
    });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
