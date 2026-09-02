import {
  DEFAULT_DESKS,
  POSITION_ROOM,
  PREFERRED_DESK_LABELS,
  type PositionKey,
} from "./constants";
import { prisma } from "./db";
import { applyDesksFromBlueprint, getActiveOfficeLayout } from "./office-layouts";
import { seatableDesks } from "./office-blueprint";

const PARK_Y = 12;

export function pickDeskForPosition<T extends { id: string; label: string; room: string }>(
  desks: T[],
  position: PositionKey,
  taken: Set<string>,
): T | undefined {
  for (const label of PREFERRED_DESK_LABELS[position] ?? []) {
    const match = desks.find((d) => d.label === label && !taken.has(d.id));
    if (match) return match;
  }
  const room = POSITION_ROOM[position];
  return desks.find((d) => d.room === room && !taken.has(d.id)) ?? desks.find((d) => !taken.has(d.id));
}

function desksMatchLayout(desks: Array<{ label: string; x: number; y: number; room: string }>) {
  if (desks.length < DEFAULT_DESKS.length) return false;
  return DEFAULT_DESKS.every((target) =>
    desks.some(
      (d) => d.label === target.label && d.x === target.x && d.y === target.y && d.room === target.room,
    ),
  );
}

const SPARE_TILES = [
  { x: 4, y: 8, room: "Engineering" },
  { x: 2, y: 8, room: "Engineering" },
  { x: 7, y: 6, room: "Reception" },
  { x: 6, y: 4, room: "QA" },
  { x: 2, y: 4, room: "Executive" },
] as const;

/** Move existing workspace desks onto the active floor plan without dropping people. */
export async function syncOfficeDesks(workspaceId: string) {
  const layout = await getActiveOfficeLayout(workspaceId);
  if (seatableDesks(layout.data).length > 0) {
    await applyDesksFromBlueprint(workspaceId, layout.data);
    return;
  }

  const existing = await prisma.desk.findMany({ where: { workspaceId } });
  if (desksMatchLayout(existing)) return;

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

    for (const target of DEFAULT_DESKS) {
      const match =
        desks.find((d) => d.label === target.label && !used.has(d.id)) ??
        desks.find((d) => !used.has(d.id) && !DEFAULT_DESKS.some((t) => t.label === d.label));
      if (match) {
        used.add(match.id);
        occupied.add(`${target.x},${target.y}`);
        await tx.desk.update({
          where: { id: match.id },
          data: { label: target.label, x: target.x, y: target.y, room: target.room },
        });
      } else {
        occupied.add(`${target.x},${target.y}`);
        await tx.desk.create({
          data: { ...target, workspaceId },
        });
      }
    }

    let spare = 0;
    for (const desk of desks) {
      if (used.has(desk.id)) continue;
      const spareTile = SPARE_TILES.find((t) => !occupied.has(`${t.x},${t.y}`));
      const tile = spareTile
        ? { x: spareTile.x, y: spareTile.y, room: spareTile.room }
        : { x: spare, y: PARK_Y - 1, room: desk.room };
      if (!spareTile) spare += 1;
      occupied.add(`${tile.x},${tile.y}`);
      await tx.desk.update({
        where: { id: desk.id },
        data: { x: tile.x, y: tile.y, room: tile.room },
      });
    }
  });
}
