import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import {
  emptyBlueprint,
  hqBlueprint,
  sanitizeBlueprint,
  seatableDesks,
  type OfficeBlueprint,
  type OfficeLayoutSummary,
} from "./office-blueprint";

export type { OfficeLayoutSummary };

export const HQ_LAYOUT_NAME = "HQ";

const PARK_Y = 12;

function asBlueprint(data: Prisma.JsonValue): OfficeBlueprint {
  return sanitizeBlueprint(data);
}

export function isProtectedLayout(row: { name: string; isProtected?: boolean | null }) {
  return Boolean(row.isProtected) || row.name.trim().toLowerCase() === HQ_LAYOUT_NAME.toLowerCase();
}

/** Ensure every workspace has a protected HQ layout (create or mark existing). */
export async function ensureOfficeLayout(workspaceId: string) {
  const rows = await prisma.officeLayout.findMany({
    where: { workspaceId },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });

  let hq =
    rows.find((r) => r.isProtected) ??
    rows.find((r) => r.name.trim().toLowerCase() === HQ_LAYOUT_NAME.toLowerCase());

  if (!hq) {
    hq = await prisma.officeLayout.create({
      data: {
        workspaceId,
        name: HQ_LAYOUT_NAME,
        data: hqBlueprint() as unknown as Prisma.InputJsonValue,
        isActive: rows.length === 0,
        isProtected: true,
      },
    });
  } else if (!hq.isProtected || hq.name !== HQ_LAYOUT_NAME) {
    hq = await prisma.officeLayout.update({
      where: { id: hq.id },
      data: { isProtected: true, name: HQ_LAYOUT_NAME },
    });
  }

  const active = rows.find((r) => r.isActive) ?? (hq.isActive ? hq : null);
  if (!active) {
    await prisma.officeLayout.update({ where: { id: hq.id }, data: { isActive: true } });
    return { ...hq, isActive: true, data: asBlueprint(hq.data) };
  }

  const current = active.id === hq.id ? { ...hq, isActive: true } : active;
  return { ...current, data: asBlueprint(current.data) };
}

export async function listOfficeLayouts(workspaceId: string): Promise<OfficeLayoutSummary[]> {
  await ensureOfficeLayout(workspaceId);
  const rows = await prisma.officeLayout.findMany({
    where: { workspaceId },
    orderBy: [{ isProtected: "desc" }, { updatedAt: "desc" }],
    select: { id: true, name: true, isActive: true, isProtected: true, updatedAt: true },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    isProtected: row.isProtected || isProtectedLayout(row),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function getActiveOfficeLayout(workspaceId: string) {
  return ensureOfficeLayout(workspaceId);
}

export async function createOfficeLayout(
  workspaceId: string,
  name: string,
  source: "empty" | "hq" | "copy" = "empty",
  copyId?: string,
) {
  await ensureOfficeLayout(workspaceId);
  let trimmed = name.trim().slice(0, 48) || "New office";
  if (trimmed.toLowerCase() === HQ_LAYOUT_NAME.toLowerCase()) {
    trimmed = "My office";
  }
  let data: OfficeBlueprint = emptyBlueprint();
  if (source === "hq") data = hqBlueprint();
  if (source === "copy" && copyId) {
    const src = await prisma.officeLayout.findFirst({ where: { id: copyId, workspaceId } });
    if (src) data = asBlueprint(src.data);
  }
  await prisma.officeLayout.updateMany({ where: { workspaceId, isActive: true }, data: { isActive: false } });
  return prisma.officeLayout.create({
    data: {
      workspaceId,
      name: trimmed,
      data: data as unknown as Prisma.InputJsonValue,
      isActive: true,
      isProtected: false,
    },
  });
}

export async function saveOfficeLayout(workspaceId: string, layoutId: string, name: string | undefined, data: unknown) {
  const row = await prisma.officeLayout.findFirst({ where: { id: layoutId, workspaceId } });
  if (!row) return null;
  const blueprint = sanitizeBlueprint(data);
  const protectedRow = isProtectedLayout(row);
  const nextName = protectedRow
    ? HQ_LAYOUT_NAME
    : name?.trim().slice(0, 48) || row.name;
  const updated = await prisma.officeLayout.update({
    where: { id: layoutId },
    data: {
      name: nextName,
      data: blueprint as unknown as Prisma.InputJsonValue,
      ...(protectedRow ? { isProtected: true } : {}),
    },
  });
  if (row.isActive) await applyDesksFromBlueprint(workspaceId, blueprint);
  return updated;
}

export async function activateOfficeLayout(workspaceId: string, layoutId: string) {
  const row = await prisma.officeLayout.findFirst({ where: { id: layoutId, workspaceId } });
  if (!row) return null;
  await prisma.$transaction([
    prisma.officeLayout.updateMany({ where: { workspaceId, isActive: true }, data: { isActive: false } }),
    prisma.officeLayout.update({ where: { id: layoutId }, data: { isActive: true } }),
  ]);
  await applyDesksFromBlueprint(workspaceId, asBlueprint(row.data));
  return row;
}

/** Reset the protected HQ floor plan to the factory layout and make it active. */
export async function restoreHqLayout(workspaceId: string) {
  await ensureOfficeLayout(workspaceId);
  const hq =
    (await prisma.officeLayout.findFirst({
      where: { workspaceId, isProtected: true },
    })) ??
    (await prisma.officeLayout.findFirst({
      where: { workspaceId, name: { equals: HQ_LAYOUT_NAME, mode: "insensitive" } },
    }));

  const blueprint = hqBlueprint();
  if (!hq) {
    const created = await prisma.officeLayout.create({
      data: {
        workspaceId,
        name: HQ_LAYOUT_NAME,
        data: blueprint as unknown as Prisma.InputJsonValue,
        isActive: true,
        isProtected: true,
      },
    });
    await prisma.officeLayout.updateMany({
      where: { workspaceId, id: { not: created.id }, isActive: true },
      data: { isActive: false },
    });
    await applyDesksFromBlueprint(workspaceId, blueprint);
    return { ...created, data: blueprint };
  }

  await prisma.$transaction([
    prisma.officeLayout.updateMany({ where: { workspaceId, isActive: true }, data: { isActive: false } }),
    prisma.officeLayout.update({
      where: { id: hq.id },
      data: {
        name: HQ_LAYOUT_NAME,
        isProtected: true,
        isActive: true,
        data: blueprint as unknown as Prisma.InputJsonValue,
      },
    }),
  ]);
  await applyDesksFromBlueprint(workspaceId, blueprint);
  return { ...hq, name: HQ_LAYOUT_NAME, isProtected: true, isActive: true, data: blueprint };
}

export async function deleteOfficeLayout(workspaceId: string, layoutId: string) {
  const rows = await prisma.officeLayout.findMany({ where: { workspaceId } });
  const row = rows.find((r) => r.id === layoutId);
  if (!row) return { error: "Not found" as const };
  if (isProtectedLayout(row)) return { error: "HQ cannot be deleted. Use Restore original instead." as const };
  if (rows.length <= 1) return { error: "Keep at least one layout" as const };

  await prisma.officeLayout.delete({ where: { id: layoutId } });
  if (row.isActive) {
    const next =
      rows.find((r) => r.id !== layoutId && isProtectedLayout(r)) ??
      rows.find((r) => r.id !== layoutId);
    if (next) await activateOfficeLayout(workspaceId, next.id);
  }
  return { ok: true as const };
}

export async function applyDesksFromBlueprint(workspaceId: string, bp: OfficeBlueprint) {
  const targets = seatableDesks(bp);
  if (targets.length === 0) return;

  const existing = await prisma.desk.findMany({ where: { workspaceId } });
  const alreadyFits = targets.every((target) =>
    existing.some(
      (d) => d.label === target.label && d.x === target.x && d.y === target.y && d.room === target.room,
    ),
  );
  if (alreadyFits) return;

  await prisma.$transaction(async (tx) => {
    const desks = await tx.desk.findMany({ where: { workspaceId } });
    for (const [i, desk] of desks.entries()) {
      await tx.desk.update({
        where: { id: desk.id },
        data: { x: i, y: PARK_Y, room: desk.room },
      });
    }

    const used = new Set<string>();
    const occupied = new Set<string>();

    for (const target of targets) {
      const match =
        desks.find((d) => d.label === target.label && !used.has(d.id)) ??
        desks.find((d) => !used.has(d.id));
      occupied.add(`${target.x},${target.y}`);
      if (match) {
        used.add(match.id);
        await tx.desk.update({
          where: { id: match.id },
          data: { label: target.label, x: target.x, y: target.y, room: target.room },
        });
      } else {
        await tx.desk.create({
          data: { ...target, workspaceId },
        });
      }
    }

    let spare = 0;
    for (const desk of desks) {
      if (used.has(desk.id)) continue;
      const x = spare;
      spare += 1;
      await tx.desk.update({
        where: { id: desk.id },
        data: { x, y: PARK_Y - 1, room: desk.room },
      });
    }
  });
}
