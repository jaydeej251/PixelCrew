import { NextResponse } from "next/server";
import { getOrCreateWorkspace } from "@/lib/seed";
import { prisma } from "@/lib/db";

export async function GET() {
  const workspace = await getOrCreateWorkspace();
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
  });
}
