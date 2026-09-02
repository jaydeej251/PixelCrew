import { DEFAULT_DESKS } from "./constants";
import {
  DEFAULT_WALL_SPECS,
  GRID_MAX,
  GRID_MIN,
  PLANNING_SEATS,
  PLANNING_TABLE,
  ROOM_HEX,
  cellRoom,
  type WallSpec,
} from "@/components/office/office-layout";

export const OBJECT_KINDS = [
  "desk",
  "computer",
  "chair",
  "table",
  "conference",
  "whiteboard",
  "tv",
  "plant",
  "cooler",
  "counter",
  "rug",
] as const;

export type OfficeObjectKind = (typeof OBJECT_KINDS)[number];

export type TileEdge = "n" | "s" | "e" | "w";

export type EditorTool = "erase" | "floor" | "wall" | OfficeObjectKind;

export type OfficeObject = {
  id: string;
  kind: OfficeObjectKind;
  x: number;
  y: number;
  color?: string;
  yaw?: number;
  label?: string;
};

export type OfficeBlueprint = {
  version: 1;
  floors: Record<string, string>;
  walls: WallSpec[];
  objects: OfficeObject[];
};

export type OfficeLayoutSummary = {
  id: string;
  name: string;
  isActive: boolean;
  isProtected?: boolean;
  updatedAt: string;
};

export const FLOOR_SWATCHES = [
  "#3d8c4a",
  "#d6d3d1",
  "#5b4a8a",
  "#a16207",
  "#4c3d7a",
  "#1f6f6a",
  "#2d4a8a",
  "#8a5a24",
  "#b45309",
  "#f5f5f4",
  "#18181b",
  "#0ea5e9",
];

export const OBJECT_CATALOG: Array<{ kind: OfficeObjectKind; label: string; hotkey: string }> = [
  { kind: "desk", label: "Desk", hotkey: "4" },
  { kind: "computer", label: "Computer", hotkey: "5" },
  { kind: "chair", label: "Chair", hotkey: "6" },
  { kind: "table", label: "Table", hotkey: "7" },
  { kind: "conference", label: "Meeting table", hotkey: "8" },
  { kind: "whiteboard", label: "Whiteboard", hotkey: "9" },
  { kind: "tv", label: "TV", hotkey: "0" },
  { kind: "plant", label: "Plant", hotkey: "P" },
  { kind: "cooler", label: "Cooler", hotkey: "C" },
  { kind: "counter", label: "Counter", hotkey: "U" },
  { kind: "rug", label: "Rug", hotkey: "G" },
];

/** Yaw steps used by Arrange mode (Minecraft-style). */
export const PLACEMENT_YAWS = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2] as const;

export function normalizePlacementYaw(yaw: number): number {
  const twoPi = Math.PI * 2;
  const wrapped = ((yaw % twoPi) + twoPi) % twoPi;
  const idx = Math.round(wrapped / (Math.PI / 2)) % 4;
  return PLACEMENT_YAWS[idx] ?? 0;
}

/** Clockwise quarter-turn (R key). */
export function cyclePlacementYaw(yaw: number): number {
  const idx = Math.round(normalizePlacementYaw(yaw) / (Math.PI / 2)) % 4;
  return PLACEMENT_YAWS[(idx + 3) % 4] ?? 0;
}

export function toolSupportsYaw(tool: EditorTool): boolean {
  return tool !== "erase" && tool !== "floor" && tool !== "wall";
}

export function objectShowsFacing(kind: string): boolean {
  return (
    kind === "desk" ||
    kind === "chair" ||
    kind === "computer" ||
    kind === "whiteboard" ||
    kind === "tv" ||
    kind === "counter" ||
    kind === "conference"
  );
}

export const EDITOR_TOOLS: Array<{ id: EditorTool; label: string; hotkey: string }> = [
  { id: "erase", label: "Erase", hotkey: "1" },
  { id: "floor", label: "Floor", hotkey: "2" },
  { id: "wall", label: "Wall", hotkey: "3" },
  ...OBJECT_CATALOG.map((item) => ({ id: item.kind as EditorTool, label: item.label, hotkey: item.hotkey })),
];

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_WALLS = 240;
const MAX_OBJECTS = 220;

export function tileKey(x: number, y: number) {
  return `${x},${y}`;
}

export function cloneBlueprint(bp: OfficeBlueprint): OfficeBlueprint {
  return {
    version: 1,
    floors: { ...bp.floors },
    walls: bp.walls.map((w) => ({ ...w })),
    objects: bp.objects.map((o) => ({ ...o })),
  };
}

function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function clampGrid(n: number) {
  return Math.min(GRID_MAX, Math.max(GRID_MIN, n));
}

function sanitizeHex(value: unknown, fallback: string) {
  return typeof value === "string" && HEX.test(value) ? value : fallback;
}

function isKind(value: unknown): value is OfficeObjectKind {
  return typeof value === "string" && (OBJECT_KINDS as readonly string[]).includes(value);
}

function rasterizeWalls(specs: WallSpec[]): WallSpec[] {
  const pieces: WallSpec[] = [];
  const doorHalf = 0.7;
  for (const spec of specs) {
    const lo = Math.min(spec.b0, spec.b1);
    const hi = Math.max(spec.b0, spec.b1);
    for (let t = Math.ceil(lo); t <= Math.floor(hi); t++) {
      if (spec.doorAt != null && Math.abs(t - spec.doorAt) < doorHalf) continue;
      pieces.push({
        id: `${spec.id}-${t}`,
        axis: spec.axis,
        a: spec.a,
        b0: t - 0.5,
        b1: t + 0.5,
        color: spec.color,
      });
    }
  }
  return pieces;
}

function paintedFloors(fill?: string): Record<string, string> {
  const floors: Record<string, string> = {};
  for (let y = GRID_MIN; y <= GRID_MAX; y++) {
    for (let x = GRID_MIN; x <= GRID_MAX; x++) {
      if (fill) {
        floors[tileKey(x, y)] = fill;
        continue;
      }
      const room = cellRoom(x, y);
      const pair = ROOM_HEX[room] ?? ROOM_HEX.hall;
      floors[tileKey(x, y)] = (x + y) % 2 === 0 ? pair[0] : pair[1];
    }
  }
  return floors;
}

export function emptyBlueprint(): OfficeBlueprint {
  return {
    version: 1,
    floors: paintedFloors("#3d8c4a"),
    walls: [],
    objects: [],
  };
}

export function hqBlueprint(): OfficeBlueprint {
  const objects: OfficeObject[] = [
    ...DEFAULT_DESKS.map((desk) => ({
      id: `desk-${desk.label}`,
      kind: "desk" as const,
      x: desk.x,
      y: desk.y,
      label: desk.label,
      color: "#b45309",
    })),
    { id: "conference", kind: "conference", x: PLANNING_TABLE.x, y: PLANNING_TABLE.y, color: "#b45309" },
    ...PLANNING_SEATS.map((seat, i) => ({
      id: `meet-chair-${i}`,
      kind: "chair" as const,
      x: seat.x,
      y: seat.y,
      color: "#292524",
    })),
    { id: "whiteboard", kind: "whiteboard", x: 2.55, y: 0.72, color: "#f8fafc" },
    { id: "tv", kind: "tv", x: 4.55, y: 1.7, color: "#18181b" },
    { id: "rug", kind: "rug", x: 6.7, y: 7.55, color: "#7c2d12" },
    { id: "wait-1", kind: "chair", x: 6.2, y: 7.85, color: "#9a3412" },
    { id: "wait-2", kind: "chair", x: 6.7, y: 7.85, color: "#9a3412" },
    { id: "wait-3", kind: "chair", x: 7.2, y: 7.85, color: "#9a3412" },
    { id: "coffee", kind: "table", x: 6.55, y: 7.7, color: "#a8a29e" },
    { id: "counter", kind: "counter", x: 6.55, y: 6.55, color: "#e7e5e4" },
    { id: "cooler", kind: "cooler", x: 5.1, y: 3.15, color: "#e2e8f0" },
  ];
  return {
    version: 1,
    floors: paintedFloors(),
    walls: rasterizeWalls(DEFAULT_WALL_SPECS),
    objects,
  };
}

export function floorColorAt(bp: { floors?: Record<string, string> } | undefined, x: number, y: number) {
  const painted = bp?.floors?.[tileKey(x, y)];
  if (painted) return painted;
  const room = cellRoom(x, y);
  const pair = ROOM_HEX[room] ?? ROOM_HEX.hall;
  return (x + y) % 2 === 0 ? pair[0] : pair[1];
}

export function sanitizeBlueprint(raw: unknown): OfficeBlueprint {
  const fallback = hqBlueprint();
  if (!raw || typeof raw !== "object") return fallback;
  const data = raw as Partial<OfficeBlueprint>;
  const floors: Record<string, string> = {};
  if (data.floors && typeof data.floors === "object") {
    for (const [key, value] of Object.entries(data.floors)) {
      const match = /^(\d+),(\d+)$/.exec(key);
      if (!match) continue;
      const x = Number(match[1]);
      const y = Number(match[2]);
      if (x < GRID_MIN || x > GRID_MAX || y < GRID_MIN || y > GRID_MAX) continue;
      if (typeof value !== "string" || !HEX.test(value)) continue;
      floors[key] = value;
    }
  }
  const walls: WallSpec[] = [];
  if (Array.isArray(data.walls)) {
    for (const wall of data.walls) {
      if (!wall || typeof wall !== "object") continue;
      const axis = wall.axis === "v" ? "v" : wall.axis === "h" ? "h" : null;
      if (!axis) continue;
      if (typeof wall.a !== "number" || typeof wall.b0 !== "number" || typeof wall.b1 !== "number") continue;
      walls.push({
        id: typeof wall.id === "string" && wall.id ? wall.id : newId("wall"),
        axis,
        a: wall.a,
        b0: wall.b0,
        b1: wall.b1,
        color: sanitizeHex(wall.color, "#f5f5f4"),
        doorAt: typeof wall.doorAt === "number" ? wall.doorAt : undefined,
      });
      if (walls.length >= MAX_WALLS) break;
    }
  }
  const objects: OfficeObject[] = [];
  if (Array.isArray(data.objects)) {
    for (const obj of data.objects) {
      if (!obj || typeof obj !== "object" || !isKind(obj.kind)) continue;
      if (typeof obj.x !== "number" || typeof obj.y !== "number") continue;
      objects.push({
        id: typeof obj.id === "string" && obj.id ? obj.id : newId("obj"),
        kind: obj.kind,
        x: obj.x,
        y: obj.y,
        color: typeof obj.color === "string" && HEX.test(obj.color) ? obj.color : undefined,
        yaw: typeof obj.yaw === "number" ? obj.yaw : undefined,
        label: typeof obj.label === "string" ? obj.label.slice(0, 32) : undefined,
      });
      if (objects.length >= MAX_OBJECTS) break;
    }
  }
  return { version: 1, floors, walls, objects };
}

export function edgeLine(
  x: number,
  y: number,
  edge: TileEdge,
): { axis: "h" | "v"; a: number; b0: number; b1: number } {
  if (edge === "n") return { axis: "h", a: y - 0.5, b0: x - 0.5, b1: x + 0.5 };
  if (edge === "s") return { axis: "h", a: y + 0.5, b0: x - 0.5, b1: x + 0.5 };
  if (edge === "w") return { axis: "v", a: x - 0.5, b0: y - 0.5, b1: y + 0.5 };
  return { axis: "v", a: x + 0.5, b0: y - 0.5, b1: y + 0.5 };
}

function sameWall(a: WallSpec, b: { axis: "h" | "v"; a: number; b0: number; b1: number }) {
  return a.axis === b.axis && Math.abs(a.a - b.a) < 0.12 && Math.abs(a.b0 - b.b0) < 0.12 && Math.abs(a.b1 - b.b1) < 0.12;
}

/** Looser match so HQ walls on .55/.75 lines still erase from nearest tile edge. */
export function wallMatchesEdge(
  wall: WallSpec,
  x: number,
  y: number,
  edge: TileEdge,
  aTol = 0.35,
): boolean {
  const line = edgeLine(x, y, edge);
  if (wall.axis !== line.axis) return false;
  if (Math.abs(wall.a - line.a) > aTol) return false;
  const lo = Math.min(wall.b0, wall.b1);
  const hi = Math.max(wall.b0, wall.b1);
  const llo = Math.min(line.b0, line.b1);
  const lhi = Math.max(line.b0, line.b1);
  return hi > llo - 0.05 && lo < lhi + 0.05;
}

function objectsNear(bp: OfficeBlueprint, x: number, y: number, radius = 0.42) {
  return bp.objects.filter((obj) => Math.hypot(obj.x - x, obj.y - y) < radius);
}

export type ErasePreview = {
  hasObject: boolean;
  hasWall: boolean;
  hasFloor: boolean;
};

/** What erase would remove at this tile/edge (priority: object → wall → floor). */
export function erasePreviewAt(
  bp: {
    floors: Record<string, string>;
    walls: WallSpec[];
    objects: Array<{ x: number; y: number }>;
  },
  x: number,
  y: number,
  edge: TileEdge,
): ErasePreview {
  const gx = clampGrid(Math.round(x));
  const gy = clampGrid(Math.round(y));
  const hasObject = bp.objects.some((obj) => Math.hypot(obj.x - gx, obj.y - gy) < 0.42);
  const hasWall = bp.walls.some((w) => wallMatchesEdge(w, gx, gy, edge));
  const hasFloor = Boolean(bp.floors[tileKey(gx, gy)]);
  return { hasObject, hasWall, hasFloor };
}

export function eraseWallByKey(bp: OfficeBlueprint, wallKey: string): OfficeBlueprint {
  const next = cloneBlueprint(bp);
  next.walls = next.walls.filter(
    (w) => w.id !== wallKey && !wallKey.startsWith(`${w.id}-`),
  );
  return next;
}

export function applyBlueprintEdit(
  bp: OfficeBlueprint,
  tool: EditorTool,
  color: string,
  x: number,
  y: number,
  edge: TileEdge = "n",
  yaw = 0,
): OfficeBlueprint {
  const next = cloneBlueprint(bp);
  const gx = clampGrid(Math.round(x));
  const gy = clampGrid(Math.round(y));
  const paint = sanitizeHex(color, "#d6d3d1");
  const facing = normalizePlacementYaw(yaw);

  if (tool === "floor") {
    next.floors[tileKey(gx, gy)] = paint;
    return next;
  }

  if (tool === "wall") {
    const line = edgeLine(gx, gy, edge);
    if (next.walls.some((w) => sameWall(w, line))) return next;
    if (next.walls.length >= MAX_WALLS) return next;
    next.walls.push({ id: newId("wall"), ...line, color: paint });
    return next;
  }

  if (tool === "erase") {
    const near = objectsNear(next, gx, gy);
    if (near.length > 0) {
      const ids = new Set(near.map((o) => o.id));
      next.objects = next.objects.filter((o) => !ids.has(o.id));
      return next;
    }
    const before = next.walls.length;
    next.walls = next.walls.filter((w) => !wallMatchesEdge(w, gx, gy, edge));
    if (next.walls.length !== before) return next;
    delete next.floors[tileKey(gx, gy)];
    return next;
  }

  if (next.objects.length >= MAX_OBJECTS) return next;
  next.objects = next.objects.filter((obj) => Math.hypot(obj.x - gx, obj.y - gy) >= 0.35 || obj.kind !== tool);
  const label = tool === "desk" ? `Desk ${gx},${gy}` : undefined;
  next.objects.push({
    id: newId(tool),
    kind: tool,
    x: gx,
    y: gy,
    color: paint,
    yaw: facing,
    label,
  });
  return next;
}

/**
 * Nearest tile edge from a click/hover offset within the tile.
 * `dx` is world X (east +), `dz` is world Z (south +) — same as Three.js office space.
 */
export function edgeFromOffset(dx: number, dz: number): TileEdge {
  if (Math.abs(dz) > Math.abs(dx)) return dz < 0 ? "n" : "s";
  return dx < 0 ? "w" : "e";
}

export function seatableDesks(bp: OfficeBlueprint) {
  const seen = new Set<string>();
  const desks: Array<{ label: string; x: number; y: number; room: string }> = [];
  for (const obj of bp.objects) {
    if (obj.kind !== "desk") continue;
    const x = Math.round(obj.x);
    const y = Math.round(obj.y);
    const key = tileKey(x, y);
    if (seen.has(key)) continue;
    seen.add(key);
    desks.push({
      label: obj.label?.trim() || `Desk ${x},${y}`,
      x,
      y,
      room: cellRoom(x, y) === "grass" ? "hall" : cellRoom(x, y),
    });
  }
  return desks;
}
