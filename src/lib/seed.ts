import { prisma } from "./db";
import { DEFAULT_DESKS, AVATAR_COLORS } from "./constants";
import { pickDeskForPosition, syncOfficeDesks } from "./office-desks";
import { TEAM_TEMPLATES } from "./templates";
import { getJobBoundary, getPositionLabel } from "./templates";
import type { PositionKey } from "./constants";
import { hashPassword } from "./auth";
import type { PlanTier, PlatformRole } from "@prisma/client";

async function bootstrapWorkspaceAgents(workspaceId: string) {
  if ((await prisma.agent.count({ where: { workspaceId } })) > 0) return;

  const deskCount = await prisma.desk.count({ where: { workspaceId } });
  if (deskCount === 0) {
    await prisma.desk.createMany({
      data: DEFAULT_DESKS.map((d) => ({ ...d, workspaceId })),
    });
  } else {
    await syncOfficeDesks(workspaceId);
  }

  const template = TEAM_TEMPLATES[0];
  const deptMap = new Map<string, string>();
  for (const deptName of [...new Set(template.agents.map((a) => a.department))]) {
    const dept = await prisma.department.create({
      data: { name: deptName, workspaceId },
    });
    deptMap.set(deptName, dept.id);
  }

  const desks = await prisma.desk.findMany({ where: { workspaceId } });
  const taken = new Set<string>();

  for (const [i, agentDef] of template.agents.entries()) {
    const desk = pickDeskForPosition(desks, agentDef.position, taken);
    if (desk) taken.add(desk.id);
    await prisma.agent.create({
      data: {
        name: agentDef.name,
        position: agentDef.position,
        positionLabel: getPositionLabel(agentDef.position),
        jobBoundary: getJobBoundary(agentDef.position),
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

type SeedAccountSpec = {
  kind: "free" | "pro" | "admin";
  email: string;
  password: string;
  plan: PlanTier;
  platformRole: PlatformRole;
  orgName: string;
  orgSlug: string;
  displayName: string;
};

function readSeedPair(
  emailKey: string,
  passwordKey: string,
): { email: string; password: string } | null {
  const email = process.env[emailKey]?.trim().toLowerCase();
  const password = process.env[passwordKey];
  if (!email || !password) return null;
  return { email, password };
}

function collectSeedSpecs(): SeedAccountSpec[] {
  const specs: SeedAccountSpec[] = [];

  const free = readSeedPair("SEED_FREE_EMAIL", "SEED_FREE_PASSWORD");
  if (free) {
    specs.push({
      kind: "free",
      email: free.email,
      password: free.password,
      plan: "free",
      platformRole: "none",
      orgName: "Seed Free Company",
      orgSlug: "seed-free",
      displayName: "Free Seed",
    });
  }

  const pro = readSeedPair("SEED_PRO_EMAIL", "SEED_PRO_PASSWORD");
  if (pro) {
    specs.push({
      kind: "pro",
      email: pro.email,
      password: pro.password,
      plan: "pro",
      platformRole: "none",
      orgName: "Seed Pro Company",
      orgSlug: "seed-pro",
      displayName: "Pro Seed",
    });
  }

  const admin = readSeedPair("SEED_ADMIN_EMAIL", "SEED_ADMIN_PASSWORD");
  if (admin) {
    specs.push({
      kind: "admin",
      email: admin.email,
      password: admin.password,
      plan: "free",
      platformRole: "ops",
      orgName: "Seed Admin Company",
      orgSlug: "seed-admin",
      displayName: "Platform Admin",
    });
  }

  return specs;
}

function assertSeedAllowed(): void {
  const allow =
    process.env.ALLOW_DB_SEED === "true" || process.env.NODE_ENV !== "production";
  if (!allow) {
    throw new Error(
      "Database seed is blocked in production. Set ALLOW_DB_SEED=true only for controlled recovery.",
    );
  }
}

async function upsertSeedAccount(spec: SeedAccountSpec) {
  const passwordHash = await hashPassword(spec.password);
  let user = await prisma.user.findUnique({ where: { email: spec.email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: spec.email,
        name: spec.displayName,
        passwordHash,
        platformRole: spec.platformRole,
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        platformRole: spec.platformRole,
        name: user.name ?? spec.displayName,
      },
    });
  }

  let org = await prisma.organization.findUnique({ where: { slug: spec.orgSlug } });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: spec.orgName,
        slug: spec.orgSlug,
        plan: spec.plan,
        memberships: { create: { userId: user.id, role: "owner" } },
      },
    });
  } else {
    org = await prisma.organization.update({
      where: { id: org.id },
      data: { plan: spec.plan, name: spec.orgName },
    });
    const membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    });
    if (!membership) {
      await prisma.membership.create({
        data: { userId: user.id, organizationId: org.id, role: "owner" },
      });
    }
  }

  let workspace = await prisma.workspace.findFirst({
    where: { organizationId: org.id },
  });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: "Main Office",
        organizationId: org.id,
        ceoGoal: "",
      },
    });
  }

  await bootstrapWorkspaceAgents(workspace.id);

  return { user, org, workspace, kind: spec.kind };
}

export async function seedDatabase() {
  assertSeedAllowed();

  const specs = collectSeedSpecs();
  if (specs.length === 0) {
    return {
      accounts: [] as Awaited<ReturnType<typeof upsertSeedAccount>>[],
      message:
        "No SEED_* email/password pairs set. Add SEED_FREE_*, SEED_PRO_*, and/or SEED_ADMIN_* in .env.local.",
    };
  }

  const accounts = [];
  for (const spec of specs) {
    accounts.push(await upsertSeedAccount(spec));
  }

  return { accounts, message: `Seeded ${accounts.length} account(s).` };
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

  await syncOfficeDesks(workspaceId);

  const desks = await prisma.desk.findMany({ where: { workspaceId } });
  const taken = new Set<string>();

  for (const [i, agentDef] of template.agents.entries()) {
    const desk = pickDeskForPosition(desks, agentDef.position, taken);
    if (desk) taken.add(desk.id);
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
