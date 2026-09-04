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

export type WallSpec = {
  id: string;
  axis: "h" | "v";
  a: number;
  b0: number;
  b1: number;
  color: string;
  doorAt?: number;
};

export type OfficeViewProps = {
  agents: OfficeAgent[];
  desks: OfficeDesk[];
  selectedAgentId?: string | null;
  onSelectAgent?: (id: string) => void;
  agentStatuses?: Record<string, OfficeAgent["status"]>;
  events?: RunEventMessage[];
  /** True while a run or simulate is on. Idle people keep roaming; only the active worker sits. */
  onShift?: boolean;
  /** Council / plan review — people gather in the planning room. */
  inPlanning?: boolean;
  /** Saved / draft floor plan. When omitted, the built-in HQ is used. */
  blueprint?: {
    version: 1;
    floors: Record<string, string>;
    walls: WallSpec[];
    objects: Array<{
      id: string;
      kind: string;
      x: number;
      y: number;
      color?: string;
      yaw?: number;
      label?: string;
    }>;
  };
  editor?: {
    enabled: boolean;
    tool: string;
    color: string;
    /** Placement yaw for furniture (radians). Walls ignore this and use `edge`. */
    yaw?: number;
    onTile: (x: number, y: number, edge: "n" | "s" | "e" | "w") => void;
    /** Erase a wall segment by its blueprint / render key. */
    onWall?: (wallKey: string) => void;
  };
};

export const GRID_MIN = 0;
export const GRID_MAX = 9;
export const CELL = 1.55;
/** Keep drei Html overlays below app modals (drei default is ~16 million). */
export const OFFICE_HTML_Z: [number, number] = [40, 10];

export const ROOM_HEX: Record<string, [string, string]> = {
  Planning: ["#5b4a8a", "#4a3c72"],
  Reception: ["#a16207", "#854d0e"],
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

/**
 * Floor plan (y grows south, toward the front door):
 *   North — Planning room (conference) | Hall
 *   Mid   — Executive | Product | QA
 *   South — Engineering bullpen | Reception (front door)
 * Doors sit on half-grid lines so integer desks never block them.
 */
export const ROOM_RECTS: RoomRect[] = [
  { id: "Planning", minX: 0.7, maxX: 4.7, minY: 0.6, maxY: 2.75, wall: "#ddd6fe" },
  { id: "Executive", minX: 0.7, maxX: 2.7, minY: 3.55, maxY: 5.4, wall: "#c4b5fd" },
  { id: "Product", minX: 2.9, maxX: 5.35, minY: 3.55, maxY: 5.4, wall: "#99f6e4" },
  { id: "QA", minX: 5.5, maxX: 8.4, minY: 3.55, maxY: 5.4, wall: "#fde68a" },
  { id: "Engineering", minX: 0.7, maxX: 5.35, minY: 5.65, maxY: 8.4, wall: "#bfdbfe" },
  { id: "Reception", minX: 5.5, maxX: 8.4, minY: 5.65, maxY: 8.4, wall: "#fed7aa" },
];

export const BUILDING = { minX: 0.55, maxX: 8.55, minY: 0.5, maxY: 8.55 };

/** Conference table center (grid). Seats face this point. */
export const PLANNING_TABLE = { x: 2.55, y: 1.7 };
export const PLANNING_SEATS: Array<{ x: number; y: number }> = [
  { x: 1.85, y: 1.35 },
  { x: 2.55, y: 1.28 },
  { x: 3.25, y: 1.35 },
  { x: 1.85, y: 2.12 },
  { x: 2.55, y: 2.18 },
  { x: 3.25, y: 2.12 },
];

export function cellRoom(x: number, y: number, _desks?: OfficeDesk[]): string {
  void _desks;
  if (x < BUILDING.minX || y < BUILDING.minY || x > BUILDING.maxX || y > BUILDING.maxY) {
    return "grass";
  }
  for (const room of ROOM_RECTS) {
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
const CREAM = "#f5f5f4";

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

export const DEFAULT_WALL_SPECS: WallSpec[] = [
  { id: "outer-n", axis: "h", a: BUILDING.minY, b0: BUILDING.minX, b1: BUILDING.maxX, color: CREAM },
  { id: "outer-s", axis: "h", a: BUILDING.maxY, b0: BUILDING.minX, b1: BUILDING.maxX, color: CREAM, doorAt: 6.5 },
  { id: "outer-w", axis: "v", a: BUILDING.minX, b0: BUILDING.minY, b1: BUILDING.maxY, color: CREAM },
  { id: "outer-e", axis: "v", a: BUILDING.maxX, b0: BUILDING.minY, b1: BUILDING.maxY, color: CREAM },
  { id: "plan-s", axis: "h", a: 2.75, b0: 0.7, b1: 4.7, color: "#c4b5fd", doorAt: 2.5 },
  { id: "plan-e", axis: "v", a: 4.7, b0: 0.6, b1: 2.75, color: "#c4b5fd" },
  { id: "exec-n", axis: "h", a: 3.55, b0: 0.7, b1: 2.7, color: "#c4b5fd", doorAt: 1.5 },
  { id: "exec-e", axis: "v", a: 2.7, b0: 3.55, b1: 5.4, color: "#c4b5fd" },
  { id: "prod-n", axis: "h", a: 3.55, b0: 2.9, b1: 5.35, color: "#5eead4", doorAt: 4.0 },
  { id: "prod-s", axis: "h", a: 5.4, b0: 2.9, b1: 5.35, color: "#5eead4" },
  { id: "prod-e", axis: "v", a: 5.35, b0: 3.55, b1: 5.4, color: "#5eead4" },
  { id: "qa-n", axis: "h", a: 3.55, b0: 5.5, b1: 8.4, color: "#fbbf24" },
  { id: "qa-s", axis: "h", a: 5.4, b0: 5.5, b1: 8.4, color: "#fbbf24", doorAt: 6.5 },
  { id: "qa-w", axis: "v", a: 5.5, b0: 3.55, b1: 5.4, color: "#fbbf24" },
  { id: "eng-n", axis: "h", a: 5.65, b0: 0.7, b1: 5.35, color: "#93c5fd", doorAt: 2.5 },
  { id: "eng-e", axis: "v", a: 5.35, b0: 5.65, b1: 8.4, color: "#93c5fd" },
  { id: "rec-n", axis: "h", a: 5.65, b0: 5.5, b1: 8.4, color: "#fdba74", doorAt: 6.5 },
  { id: "rec-w", axis: "v", a: 5.5, b0: 5.65, b1: 8.4, color: "#fdba74" },
];

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

export function wallsFromSpecs(specs: WallSpec[]): WallSeg[] {
  const segs: WallSeg[] = [];
  for (const spec of specs) {
    walledEdge(segs, spec.axis, spec.a, spec.b0, spec.b1, spec.color, spec.id, spec.doorAt);
  }
  return segs;
}

export function buildingWalls(specs?: WallSpec[]): WallSeg[] {
  return wallsFromSpecs(specs ?? DEFAULT_WALL_SPECS);
}

/** Door centers used to keep integer desks out of openings. */
export const DOORWAYS: Array<{ axis: "h" | "v"; x: number; y: number }> = [
  { axis: "h", x: 6.5, y: BUILDING.maxY },
  { axis: "h", x: 2.5, y: 2.75 },
  { axis: "h", x: 1.5, y: 3.55 },
  { axis: "h", x: 4.0, y: 3.55 },
  { axis: "h", x: 6.5, y: 5.4 },
  { axis: "h", x: 2.5, y: 5.65 },
  { axis: "h", x: 6.5, y: 5.65 },
];

/** Reception entrance — new hires spawn here and walk in. */
export const FRONT_DOOR = { x: 6.5, y: BUILDING.maxY };

export function deskClearOfDoors(x: number, y: number): boolean {
  const half = 0.85 / 2 + 0.25;
  const depth = 0.6;
  for (const door of DOORWAYS) {
    if (door.axis === "h") {
      if (Math.abs(y - door.y) < depth && Math.abs(x - door.x) < half) return false;
    } else if (Math.abs(x - door.x) < depth && Math.abs(y - door.y) < half) {
      return false;
    }
  }
  return true;
}

export function hallWaypoint(): { x: number; y: number } {
  return { x: 5.1, y: 3.15 };
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
