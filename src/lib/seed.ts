import { prisma } from "./db";
import { DEFAULT_DESKS, AVATAR_COLORS } from "./constants";
import { TEAM_TEMPLATES } from "./templates";
import { slugify } from "./utils";
import { getJobBoundary, getPositionLabel } from "./templates";
import type { PositionKey } from "./constants";

export async function seedDatabase() {
  const email = "ceo@pixelcrew.local";
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email, name: "CEO", passwordHash: "dev" },
    });
  }

  let org = await prisma.organization.findUnique({ where: { slug: "default" } });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: "Default Company",
        slug: "default",
        plan: "free",
        memberships: { create: { userId: user.id, role: "owner" } },
      },
    });
  }

  let workspace = await prisma.workspace.findFirst({
    where: { organizationId: org.id },
  });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: "Main Office",
        organizationId: org.id,
        ceoGoal: "Build a personal habit tracker with login",
      },
    });

    await prisma.desk.createMany({
      data: DEFAULT_DESKS.map((d) => ({ ...d, workspaceId: workspace!.id })),
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
  }

  return { user, org, workspace };
}

export async function applyTemplate(workspaceId: string, templateId: string) {
  const template = TEAM_TEMPLATES.find((t) => t.id === templateId);
  if (!template) throw new Error("Template not found");

  await prisma.agent.deleteMany({ where: { workspaceId } });
  await prisma.department.deleteMany({ where: { workspaceId } });

  const deptMap = new Map<string, string>();
  for (const deptName of [...new Set(template.agents.map((a) => a.department))]) {
    const dept = await prisma.department.create({
      data: { name: deptName, workspaceId },
    });
    deptMap.set(deptName, dept.id);
  }

  const desks = await prisma.desk.findMany({ where: { workspaceId } });
  let deskIdx = 0;

  for (const [i, agentDef] of template.agents.entries()) {
    const desk = desks[deskIdx % desks.length];
    deskIdx++;
    await prisma.agent.create({
      data: {
        name: agentDef.name,
        position: agentDef.position,
        positionLabel: getPositionLabel(agentDef.position as PositionKey),
        jobBoundary: getJobBoundary(agentDef.position as PositionKey),
        avatarColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
        workspaceId,
        departmentId: deptMap.get(agentDef.department),
        deskId: desk?.id,
        provider: "mock",
        model: "mock",
      },
    });
  }
}

export async function getOrCreateWorkspace() {
  const seeded = await seedDatabase();
  return seeded.workspace!;
}
