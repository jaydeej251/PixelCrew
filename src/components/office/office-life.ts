import type { AgentStatus } from "@prisma/client";
import type { OfficeAgent } from "@/lib/office";
import { gridToWorld, hallWaypoint, randomPointInRoom, roomOfAgent } from "./office-layout";

export type LifeActivity = "work" | "walk" | "stand" | "talk" | "stuck" | "wait";

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

function toWorld(grid: { x: number; y: number }) {
  const [wx, , wz] = gridToWorld(grid.x, grid.y);
  return { x: wx, z: wz };
}

function goToDesk(life: LifeState, agent: OfficeAgent, dt: number, speed: number, then: LifeActivity) {
  const p = atDesk(agent);
  life.tx = p.x;
  life.tz = p.z;
  life.faceX = p.x;
  life.faceZ = p.z - 1;
  const dx = p.x - life.x;
  const dz = p.z - life.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 0.07) {
    const step = Math.min(dist, speed * dt);
    life.x += (dx / dist) * step;
    life.z += (dz / dist) * step;
    life.activity = "walk";
    return false;
  }
  life.x = p.x;
  life.z = p.z;
  life.activity = then;
  return true;
}

export function ensureLife(map: Map<string, LifeState>, agent: OfficeAgent, now: number) {
  if (map.has(agent.id)) return;
  const p = atDesk(agent);
  map.set(agent.id, {
    x: p.x,
    z: p.z,
    tx: p.x,
    tz: p.z,
    until: now + 0.3 + (hash(agent.id) % 8) * 0.15,
    activity: "stand",
    faceX: p.x,
    faceZ: p.z - 1,
    workHoldUntil: 0,
  });
}

function pickWander(agent: OfficeAgent, now: number, salt: number): Partial<LifeState> {
  const roll = (salt * 1.37) % 1;
  const room = roomOfAgent(agent);
  const grid =
    roll < 0.22
      ? hallWaypoint()
      : roll < 0.38
        ? (agent.desk ?? hallWaypoint())
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
  onShift: boolean,
) {
  const idle = agents.filter((a) => {
    const s = statuses[a.id] ?? a.status;
    return s === "idle";
  });

  for (const agent of agents) {
    ensureLife(map, agent, now);
    const st = statuses[agent.id] ?? agent.status;
    const life = map.get(agent.id)!;

    if (st === "working") {
      life.workHoldUntil = Math.max(life.workHoldUntil, now + 6);
    }

    const heldWork = life.workHoldUntil > now && (st === "idle" || st === "working");
    if (st === "working" || heldWork) {
      goToDesk(life, agent, dt, 2.4, "work");
      life.partnerId = undefined;
      continue;
    }
    if (st === "blocked" || st === "error") {
      life.activity = "stuck";
      continue;
    }
    if (st === "handoff" || st === "walking") {
      if (onShift) {
        goToDesk(life, agent, dt, 2.2, "wait");
      } else {
        life.activity = "walk";
      }
      continue;
    }

    if (onShift) {
      goToDesk(life, agent, dt, 2.2, "wait");
      life.partnerId = undefined;
      continue;
    }

    if (st !== "idle") continue;

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
        ensureLife(map, partner, now);
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
