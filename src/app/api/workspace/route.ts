import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, getPlanUsage } from "@/lib/auth";
import { syncOfficeDesks } from "@/lib/office-desks";
import { listOfficeLayouts, getActiveOfficeLayout } from "@/lib/office-layouts";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ workspace: null, agents: [], desks: [], departments: [] });
  }

  const workspace = await prisma.workspace.findFirst({
    where: { id: session.workspaceId, organizationId: session.organizationId },
  });
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await syncOfficeDesks(workspace.id);

  const [agents, desks, departments, officeLayouts, officeLayout, usage] = await Promise.all([
    prisma.agent.findMany({
      where: { workspaceId: workspace.id },
      include: { desk: true, department: true },
    }),
    prisma.desk.findMany({ where: { workspaceId: workspace.id } }),
    prisma.department.findMany({ where: { workspaceId: workspace.id } }),
    listOfficeLayouts(workspace.id),
    getActiveOfficeLayout(workspace.id),
    getPlanUsage(session.organizationId),
  ]);

  return NextResponse.json({
    workspace: {
      id: workspace.id,
      name: workspace.name,
      ceoGoal: workspace.ceoGoal,
    },
    agents,
    desks,
    departments,
    officeLayouts,
    officeLayout: {
      id: officeLayout.id,
      name: officeLayout.name,
      isActive: officeLayout.isActive,
      isProtected: Boolean(
        (officeLayout as { isProtected?: boolean }).isProtected || officeLayout.name === "HQ",
      ),
      data: officeLayout.data,
    },
    user: { email: session.email, name: session.name },
    usage: {
      used: usage.used,
      limit: usage.limit,
      plan: usage.plan,
      canRun: usage.canRun,
      reason: usage.reason ?? null,
    },
  });
}
