import type { AgentStatus } from "@prisma/client";
import type { OfficeAgent } from "@/lib/office";
import {
  FRONT_DOOR,
  gridToWorld,
  hallWaypoint,
  PLANNING_SEATS,
  PLANNING_TABLE,
  randomPointInRoom,
  roomOfAgent,
} from "./office-layout";

export type LifeActivity = "work" | "walk" | "stand" | "talk" | "stuck" | "wait" | "meet";

const MEETING_ROLES = new Set([
  "dispatcher",
  "executive",
  "project_manager",
  "designer",
  "tech_architect",
]);

const DESK_CODERS = new Set([
  "engineer",
  "frontend_engineer",
  "backend_engineer",
  "qa_engineer",
]);

export type LifeState = {
  x: number;
  z: number;
  tx: number;
  tz: number;
  until: number;
  activity: LifeActivity;
  faceX: number;
  faceZ: number;
  partnerId?: string;
  workHoldUntil: number;
};

function hash(n: string) {
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 33 + n.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function atDesk(agent: OfficeAgent): { x: number; z: number } {
  const home = agent.desk ?? { x: 4, y: 4 };
  const [wx, , wz] = gridToWorld(home.x, home.y);
  return { x: wx + 0.04, z: wz + 0.48 };
}

export function atFrontDoor(): { x: number; z: number } {
  const [wx, , wz] = gridToWorld(FRONT_DOOR.x, FRONT_DOOR.y);
  return { x: wx, z: wz + 0.35 };
}

export function isQaEngineer(position: string) {
  return position === "qa_engineer";
}

export function activityLabel(first: string, act: LifeActivity, position?: string) {
  if (act === "work" && position && isQaEngineer(position)) return `${first} · reviewing`;
  if (act === "work") return `${first} · coding`;
  if (act === "meet") return `${first} · planning`;
  if (act === "wait") return `${first} · at desk`;
  if (act === "talk") return `${first} · chatting`;
  if (act === "walk") return `${first} · walking`;
  if (act === "stuck") return `${first} · stuck`;
  return first;
}

export function workBadgeLabel(position?: string) {
  return position && isQaEngineer(position) ? "QA" : "CODING";
}

export function isMeetingRole(position: string) {
  return MEETING_ROLES.has(position);
}

export function meetingSeatIndex(agentId: string, meetingIds: string[]) {
  const sorted = [...meetingIds].sort();
  const i = sorted.indexOf(agentId);
  return (i < 0 ? hash(agentId) : i) % PLANNING_SEATS.length;
}

export function planningSeatGrid(index: number) {
  return PLANNING_SEATS[index % PLANNING_SEATS.length]!;
}

export function atPlanningSeat(
  agent: OfficeAgent,
  seatIndex?: number,
): { x: number; z: number; faceX: number; faceZ: number } {
  const seat = planningSeatGrid(seatIndex ?? hash(agent.id));
  const [wx, , wz] = gridToWorld(seat.x, seat.y);
  const [fx, , fz] = gridToWorld(PLANNING_TABLE.x, PLANNING_TABLE.y);
  return { x: wx, z: wz, faceX: fx, faceZ: fz };
}

function codesAtDesk(agent: OfficeAgent) {
  return DESK_CODERS.has(agent.position);
}

function shouldMeet(
  agent: OfficeAgent,
  st: AgentStatus,
  inPlanning: boolean,
  heldWork: boolean,
) {
  if (!MEETING_ROLES.has(agent.position)) return false;
  if (inPlanning) return true;
  return st === "working" || st === "walking" || heldWork;
}

function toWorld(grid: { x: number; y: number }) {
  const [wx, , wz] = gridToWorld(grid.x, grid.y);
  return { x: wx, z: wz };
}

function goTo(
  life: LifeState,
  dest: { x: number; z: number },
  face: { x: number; z: number },
  dt: number,
  speed: number,
  then: LifeActivity,
) {
  life.tx = dest.x;
  life.tz = dest.z;
  life.faceX = face.x;
  life.faceZ = face.z;
  const dx = dest.x - life.x;
  const dz = dest.z - life.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 0.07) {
    const step = Math.min(dist, speed * dt);
    life.x += (dx / dist) * step;
    life.z += (dz / dist) * step;
    life.activity = "walk";
    return false;
  }
  life.x = dest.x;
  life.z = dest.z;
  life.activity = then;
  return true;
}

function goToDesk(life: LifeState, agent: OfficeAgent, dt: number, speed: number, then: LifeActivity) {
  const p = atDesk(agent);
  return goTo(life, p, { x: p.x, z: p.z - 1 }, dt, speed, then);
}

export function ensureLife(
  map: Map<string, LifeState>,
  agent: OfficeAgent,
  now: number,
  status?: AgentStatus,
) {
  if (map.has(agent.id)) return;
  const desk = atDesk(agent);
  const arriving = status === "walking" || status === "handoff";
  const start = arriving ? atFrontDoor() : desk;
  map.set(agent.id, {
    x: start.x,
    z: start.z,
    tx: desk.x,
    tz: desk.z,
    until: now + 0.3 + (hash(agent.id) % 8) * 0.15,
    activity: arriving ? "walk" : "stand",
    faceX: desk.x,
    faceZ: desk.z - 1,
    workHoldUntil: 0,
  });
}

function pickWander(agent: OfficeAgent, now: number, salt: number): Partial<LifeState> {
  const roll = (salt * 1.37) % 1;
  const room = roomOfAgent(agent);
  const grid =
    roll < 0.28
      ? hallWaypoint()
      : randomPointInRoom(room, salt + now);
  const w = toWorld(grid);
  return { tx: w.x, tz: w.z, activity: "walk", until: now + 6, partnerId: undefined };
}

export function simulateOfficeLife(
  map: Map<string, LifeState>,
  agents: OfficeAgent[],
  statuses: Record<string, AgentStatus | undefined>,
  now: number,
  dt: number,
  inPlanning = false,
) {
  const idle = agents.filter((a) => {
    const s = statuses[a.id] ?? a.status;
    return s === "idle";
  });

  for (const agent of agents) {
    const st = statuses[agent.id] ?? agent.status;
    ensureLife(map, agent, now, st);
    const life = map.get(agent.id)!;
    if (st === "working") {
      life.workHoldUntil = Math.max(life.workHoldUntil, now + 6);
    }
  }

  const meetingIds = agents
    .filter((agent) => {
      const st = statuses[agent.id] ?? agent.status;
      const life = map.get(agent.id)!;
      const heldWork = life.workHoldUntil > now && (st === "idle" || st === "working");
      return shouldMeet(agent, st, inPlanning, heldWork);
    })
    .map((a) => a.id);

  for (const agent of agents) {
    const st = statuses[agent.id] ?? agent.status;
    const life = map.get(agent.id)!;
    const heldWork = life.workHoldUntil > now && (st === "idle" || st === "working");
    if (shouldMeet(agent, st, inPlanning, heldWork)) {
      const seat = atPlanningSeat(agent, meetingSeatIndex(agent.id, meetingIds));
      goTo(life, seat, { x: seat.faceX, z: seat.faceZ }, dt, 2.3, "meet");
      life.partnerId = undefined;
      continue;
    }

    if ((st === "working" || heldWork) && codesAtDesk(agent)) {
      goToDesk(life, agent, dt, 2.4, "work");
      life.partnerId = undefined;
      continue;
    }
    if (st === "blocked" || st === "error") {
      life.activity = "stuck";
      continue;
    }
    if (st === "walking" && codesAtDesk(agent)) {
      goToDesk(life, agent, dt, 2.2, "wait");
      life.partnerId = undefined;
      continue;
    }
    if (st === "handoff") {
      if (now >= life.until || life.activity === "work" || life.activity === "wait") {
        Object.assign(life, pickWander(agent, now, hash(agent.id) + Math.floor(now * 3)));
        life.faceX = life.tx;
        life.faceZ = life.tz;
      }
    } else if (st !== "idle") {
      continue;
    } else {
      // Turn ended — get up and go back into the office instead of sitting around.
      if (life.activity === "work" || life.activity === "wait" || life.activity === "meet") {
        life.until = now;
        life.activity = "stand";
        life.partnerId = undefined;
      }

      if (life.partnerId && !idle.some((a) => a.id === life.partnerId)) {
        life.partnerId = undefined;
        life.until = now;
      }

      if (now >= life.until) {
        const salt = hash(agent.id) + Math.floor(now * 3);
        const others = idle.filter((a) => a.id !== agent.id);
        const wantChat = others.length > 0 && salt % 10 < 3 && !life.partnerId;

        if (wantChat) {
          const partner = others[salt % others.length];
          ensureLife(map, partner, now, statuses[partner.id] ?? partner.status);
          const other = map.get(partner.id)!;
          const mx = (life.x + other.x) / 2;
          const mz = (life.z + other.z) / 2;
          const dx = life.x - other.x || 0.4;
          const dz = life.z - other.z || 0.1;
          const len = Math.hypot(dx, dz) || 1;
          const ox = (dx / len) * 0.38;
          const oz = (dz / len) * 0.38;
          life.tx = mx + ox;
          life.tz = mz + oz;
          life.activity = "walk";
          life.until = now + 8;
          life.partnerId = partner.id;
          life.faceX = mx;
          life.faceZ = mz;
          other.tx = mx - ox;
          other.tz = mz - oz;
          other.activity = "walk";
          other.until = now + 8;
          other.partnerId = agent.id;
          other.faceX = mx;
          other.faceZ = mz;
        } else {
          Object.assign(life, pickWander(agent, now, salt));
          life.faceX = life.tx;
          life.faceZ = life.tz;
        }
      }
    }

    const dx = life.tx - life.x;
    const dz = life.tz - life.z;
    const dist = Math.hypot(dx, dz);
    const speed = 1.15;
    if (dist > 0.06) {
      const step = Math.min(dist, speed * dt);
      life.x += (dx / dist) * step;
      life.z += (dz / dist) * step;
      if (life.activity !== "talk") life.activity = "walk";
    } else if (life.partnerId) {
      life.activity = "talk";
    } else if (life.activity === "walk") {
      life.activity = "stand";
      life.until = Math.min(life.until, now + 1.8 + (hash(agent.id) % 5) * 0.4);
    }
  }
}
