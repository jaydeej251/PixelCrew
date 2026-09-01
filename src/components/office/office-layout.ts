import type { AgentStatus } from "@prisma/client";
import type { OfficeAgent } from "@/lib/office";
import type { RunEventMessage } from "@/lib/events";

export type OfficeDesk = {
  id: string;
  label: string;
  x: number;
  y: number;
  room: string;
};

export type OfficeViewProps = {
  agents: OfficeAgent[];
  desks: OfficeDesk[];
  selectedAgentId?: string | null;
  onSelectAgent?: (id: string) => void;
  agentStatuses?: Record<string, OfficeAgent["status"]>;
  events?: RunEventMessage[];
  /** True while a run or simulate is on — whole team reports to desks. */
  onShift?: boolean;
};

export const GRID_MIN = 0;
export const GRID_MAX = 9;
export const CELL = 1.55;

export const ROOM_HEX: Record<string, [string, string]> = {
  Executive: ["#4c3d7a", "#3d3166"],
  Product: ["#1f6f6a", "#185851"],
  Engineering: ["#2d4a8a", "#243c72"],
  QA: ["#8a5a24", "#70481c"],
  grass: ["#3d8c4a", "#347a40"],
  hall: ["#d6d3d1", "#c4c0bb"],
};

export type RoomRect = {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  wall: string;
};

/** Tight department boxes so walls actually separate teams. */
export const ROOM_RECTS: RoomRect[] = [
  { id: "Executive", minX: 0.85, maxX: 5.25, minY: 0.7, maxY: 2.35, wall: "#ddd6fe" },
  { id: "Product", minX: 0.85, maxX: 6.35, minY: 2.55, maxY: 4.2, wall: "#99f6e4" },
  { id: "Engineering", minX: 0.85, maxX: 5.4, minY: 4.5, maxY: 8.25, wall: "#bfdbfe" },
  { id: "QA", minX: 4.95, maxX: 8.3, minY: 6.25, maxY: 8.25, wall: "#fde68a" },
];

export const BUILDING = { minX: 0.55, maxX: 8.55, minY: 0.45, maxY: 8.55 };

export function cellRoom(x: number, y: number, _desks?: OfficeDesk[]): string {
  if (x < BUILDING.minX || y < BUILDING.minY || x > BUILDING.maxX || y > BUILDING.maxY) {
    return "grass";
  }
  // QA first so the shared corner belongs to QA desks at (5,7)/(7,7)
  for (const room of [...ROOM_RECTS].reverse()) {
    if (x >= room.minX && x <= room.maxX && y >= room.minY && y <= room.maxY) {
      return room.id;
    }
  }
  return "hall";
}

export function gridToWorld(x: number, y: number): [number, number, number] {
  return [(x - 4.5) * CELL, 0, (y - 4.5) * CELL];
}

export function worldToGrid(wx: number, wz: number) {
  return { x: wx / CELL + 4.5, y: wz / CELL + 4.5 };
}

export function roomOfAgent(agent: OfficeAgent): string {
  if (agent.desk?.room) return agent.desk.room;
  const d = agent.desk;
  if (!d) return "hall";
  return cellRoom(d.x, d.y);
}

export function rectForRoom(name: string): RoomRect | undefined {
  return ROOM_RECTS.find((r) => r.id === name);
}

export function randomPointInRoom(roomName: string, salt: number): { x: number; y: number } {
  const rects = ROOM_RECTS.filter((r) => r.id === roomName);
  const rect = rects[Math.abs(Math.floor(salt * 10)) % Math.max(1, rects.length)] ?? rectForRoom(roomName);
  if (!rect) return hallWaypoint();
  const pad = 0.4;
  const u = (Math.abs(Math.sin(salt * 12.9898)) % 1 + 1) % 1;
  const v = (Math.abs(Math.sin(salt * 78.233)) % 1 + 1) % 1;
  return {
    x: rect.minX + pad + u * Math.max(0.25, rect.maxX - rect.minX - pad * 2),
    y: rect.minY + pad + v * Math.max(0.25, rect.maxY - rect.minY - pad * 2),
  };
}

export type WallSeg = {
  key: string;
  wx: number;
  wz: number;
  sx: number;
  sz: number;
  color: string;
  kind: "wall" | "glass" | "doorpost";
};

const WALL_T = 0.14;

function horiz(y: number, x0: number, x1: number, color: string, key: string, kind: WallSeg["kind"] = "wall"): WallSeg {
  const mid = (x0 + x1) / 2;
  const [wx, , wz] = gridToWorld(mid, y);
  return { key, wx, wz, sx: Math.abs(x1 - x0) * CELL, sz: WALL_T, color, kind };
}

function vert(x: number, y0: number, y1: number, color: string, key: string, kind: WallSeg["kind"] = "wall"): WallSeg {
  const mid = (y0 + y1) / 2;
  const [wx, , wz] = gridToWorld(x, mid);
  return { key, wx, wz, sx: WALL_T, sz: Math.abs(y1 - y0) * CELL, color, kind };
}

/** Door gap in the middle of an edge, plus posts. */
function walledEdge(
  segs: WallSeg[],
  axis: "h" | "v",
  a: number,
  b0: number,
  b1: number,
  color: string,
  key: string,
  doorAt?: number,
) {
  const doorW = 0.85;
  if (doorAt == null) {
    segs.push(axis === "h" ? horiz(a, b0, b1, color, key) : vert(a, b0, b1, color, key));
    return;
  }
  const lo = doorAt - doorW / 2;
  const hi = doorAt + doorW / 2;
  if (lo > b0 + 0.15) {
    segs.push(axis === "h" ? horiz(a, b0, lo, color, `${key}-a`) : vert(a, b0, lo, color, `${key}-a`));
  }
  if (hi < b1 - 0.15) {
    segs.push(axis === "h" ? horiz(a, hi, b1, color, `${key}-b`) : vert(a, hi, b1, color, `${key}-b`));
  }
  segs.push(
    axis === "h"
      ? horiz(a, lo, lo + 0.12, "#a8a29e", `${key}-p1`, "doorpost")
      : vert(a, lo, lo + 0.12, "#a8a29e", `${key}-p1`, "doorpost"),
  );
  segs.push(
    axis === "h"
      ? horiz(a, hi - 0.12, hi, "#a8a29e", `${key}-p2`, "doorpost")
      : vert(a, hi - 0.12, hi, "#a8a29e", `${key}-p2`, "doorpost"),
  );
}

export function buildingWalls(): WallSeg[] {
  const segs: WallSeg[] = [];
  const cream = "#f5f5f4";
  const { minX, maxX, minY, maxY } = BUILDING;
  walledEdge(segs, "h", minY, minX, maxX, cream, "outer-n");
  walledEdge(segs, "h", maxY, minX, maxX, cream, "outer-s", 6.6);
  walledEdge(segs, "v", minX, minY, maxY, cream, "outer-w");
  walledEdge(segs, "v", maxX, minY, maxY, cream, "outer-e");

  walledEdge(segs, "h", 2.35, 0.85, 5.25, "#c4b5fd", "exec-s", 3.05);
  walledEdge(segs, "v", 5.25, 0.7, 2.35, "#c4b5fd", "exec-e");

  walledEdge(segs, "h", 2.55, 0.85, 6.35, "#5eead4", "prod-n", 3.05);
  walledEdge(segs, "h", 4.2, 0.85, 6.35, "#5eead4", "prod-s", 3.2);
  walledEdge(segs, "v", 6.35, 2.55, 4.2, "#5eead4", "prod-e");

  walledEdge(segs, "h", 4.5, 0.85, 5.4, "#93c5fd", "eng-n", 2.55);
  walledEdge(segs, "v", 5.4, 4.5, 6.25, "#93c5fd", "eng-e-hi");
  walledEdge(segs, "v", 4.95, 6.25, 8.25, "#93c5fd", "eng-qa", 7.15);

  walledEdge(segs, "h", 6.25, 4.95, 8.3, "#fbbf24", "qa-n", 6.55);
  walledEdge(segs, "v", 8.3, 6.25, 8.25, "#fbbf24", "qa-e");
  return segs;
}

export function hallWaypoint(): { x: number; y: number } {
  return { x: 4.5, y: 4.38 };
}

export function handoffDesk(
  agent: OfficeAgent,
  status: AgentStatus,
  desks: OfficeDesk[],
  agents: OfficeAgent[],
  events: RunEventMessage[],
): { x: number; y: number } | null {
  if (status !== "handoff" && status !== "walking") return null;
  const last = [...events]
    .reverse()
    .find(
      (e) =>
        e.type === "AGENT_HANDOFF" &&
        (e.agentId === agent.id || e.payload.agentId === agent.id),
    );
  const targetPos = last?.payload.targetPosition;
  const other =
    (targetPos && agents.find((a) => a.position === targetPos && a.id !== agent.id)) ||
    agents.find((a) => a.id !== agent.id && a.desk);
  if (other?.desk) return { x: other.desk.x, y: other.desk.y };
  const aisle = desks.find((d) => d.room !== agent.desk?.room);
  return aisle ? { x: aisle.x, y: aisle.y } : null;
}

export function agentGridPos(
  agent: OfficeAgent,
  status: AgentStatus,
  desks: OfficeDesk[],
  agents: OfficeAgent[],
  events: RunEventMessage[],
): { x: number; y: number } {
  const home = agent.desk ?? { x: 4, y: 4 };
  const dest = handoffDesk(agent, status, desks, agents, events);
  if (dest && (status === "handoff" || status === "walking")) {
    return { x: (home.x + dest.x) / 2, y: (home.y + dest.y) / 2 };
  }
  return home;
}

export type OfficeViewMode = "iso" | "3d";

export const OFFICE_VIEW_KEY = "pixelcrew.officeView";
