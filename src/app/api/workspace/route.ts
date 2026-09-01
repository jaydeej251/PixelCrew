import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ workspace: null, agents: [], desks: [], departments: [] });
  }

  const workspace = await prisma.workspace.findFirst({
    where: { id: session.workspaceId, organizationId: session.organizationId },
  });
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [agents, desks, departments] = await Promise.all([
    prisma.agent.findMany({
      where: { workspaceId: workspace.id },
      include: { desk: true, department: true },
    }),
    prisma.desk.findMany({ where: { workspaceId: workspace.id } }),
    prisma.department.findMany({ where: { workspaceId: workspace.id } }),
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
    user: { email: session.email, name: session.name },
  });
}
