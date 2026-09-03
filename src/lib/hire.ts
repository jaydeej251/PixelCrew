import type { Agent, ProviderType } from "@prisma/client";
import { prisma } from "./db";
import {
  AVATAR_COLORS,
  DEFAULT_HIRE_NAMES,
  POSITIONS,
  type PositionKey,
} from "./constants";
import { pickDeskForPosition } from "./office-desks";
import { getJobBoundary, getPositionLabel } from "./templates";

export const POSITION_DEPT: Record<string, string> = {
  dispatcher: "Executive",
  executive: "Product",
  project_manager: "Product",
  designer: "Product",
  tech_architect: "Engineering",
  engineer: "Engineering",
  frontend_engineer: "Engineering",
  backend_engineer: "Engineering",
  qa_engineer: "QA",
};

async function ensureDepartment(workspaceId: string, name: string) {
  const existing = await prisma.department.findFirst({
    where: { workspaceId, name },
  });
  if (existing) return existing;
  return prisma.department.create({ data: { workspaceId, name } });
}

async function seatOnDesk(workspaceId: string, position: PositionKey) {
  const desks = await prisma.desk.findMany({
    where: { workspaceId },
    include: { agents: true },
    orderBy: [{ y: "asc" }, { x: "asc" }],
  });
  const taken = new Set(desks.filter((d) => d.agents.length > 0).map((d) => d.id));
  return pickDeskForPosition(desks, position, taken) ?? desks[0];
}

export async function createHiredAgent(opts: {
  workspaceId: string;
  position: PositionKey;
  name: string;
  jobBoundary?: string;
  provider?: ProviderType;
  model?: string;
}): Promise<Agent> {
  const desk = await seatOnDesk(opts.workspaceId, opts.position);
  const count = await prisma.agent.count({ where: { workspaceId: opts.workspaceId } });
  const dept = await ensureDepartment(
    opts.workspaceId,
    POSITION_DEPT[opts.position] ?? "Engineering",
  );
  const name = opts.name.trim();
  if (!name) throw new Error("Name is required");

  return prisma.agent.create({
    data: {
      name,
      position: opts.position,
      positionLabel: getPositionLabel(opts.position),
      jobBoundary: opts.jobBoundary?.trim() || getJobBoundary(opts.position),
      avatarColor: AVATAR_COLORS[count % AVATAR_COLORS.length],
      workspaceId: opts.workspaceId,
      deskId: desk?.id,
      departmentId: dept.id,
      provider: opts.provider ?? "mock",
      model: opts.model ?? "mock",
    },
  });
}

export async function ensureRole(opts: {
  workspaceId: string;
  position: PositionKey;
  name?: string;
  jobBoundary?: string;
  provider?: ProviderType;
  model?: string;
}): Promise<{ agent: Agent; created: boolean }> {
  const existing = await prisma.agent.findFirst({
    where: { workspaceId: opts.workspaceId, position: opts.position },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return { agent: existing, created: false };

  const agent = await createHiredAgent({
    ...opts,
    name: opts.name?.trim() || DEFAULT_HIRE_NAMES[opts.position],
  });
  return { agent, created: true };
}

export function isPositionKey(value: string): value is PositionKey {
  return value in POSITIONS;
}
