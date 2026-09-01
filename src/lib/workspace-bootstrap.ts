import { DEFAULT_DESKS, AVATAR_COLORS } from "./constants";
import { TEAM_TEMPLATES } from "./templates";
import { getJobBoundary, getPositionLabel } from "./templates";
import { prisma } from "./db";

/** Create org, workspace, desks, and default team for a new user. */
export async function createWorkspaceForUser(userId: string, orgName: string, slug: string) {
  const org = await prisma.organization.create({
    data: {
      name: orgName,
      slug,
      plan: "free",
      memberships: { create: { userId, role: "owner" } },
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: "Main Office",
      organizationId: org.id,
      ceoGoal: "",
    },
  });

  await prisma.desk.createMany({
    data: DEFAULT_DESKS.map((d) => ({ ...d, workspaceId: workspace.id })),
  });

  const template = TEAM_TEMPLATES[0];
  const deptMap = new Map<string, string>();
  for (const deptName of [...new Set(template.agents.map((a) => a.department))]) {
    const dept = await prisma.department.create({
      data: { name: deptName, workspaceId: workspace.id },
    });
    deptMap.set(deptName, dept.id);
  }

  const desks = await prisma.desk.findMany({ where: { workspaceId: workspace.id } });
  let deskIdx = 1;

  for (const [i, agentDef] of template.agents.entries()) {
    const desk = desks[deskIdx % desks.length];
    deskIdx++;
    await prisma.agent.create({
      data: {
        name: agentDef.name,
        position: agentDef.position,
        positionLabel: getPositionLabel(agentDef.position),
        jobBoundary: getJobBoundary(agentDef.position),
        avatarColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
        workspaceId: workspace.id,
        departmentId: deptMap.get(agentDef.department),
        deskId: desk?.id,
        provider: "mock",
        model: "mock",
      },
    });
  }

  return { org, workspace };
}
