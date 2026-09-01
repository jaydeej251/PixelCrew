import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OfficeAgent } from "../../lib/office";
import { atDesk, ensureLife, simulateOfficeLife, type LifeState } from "./office-life";

function agent(id: string, deskX = 2, deskY = 2): OfficeAgent {
  return {
    id,
    name: "Casey Kim",
    position: "frontend_engineer",
    positionLabel: "Frontend",
    jobBoundary: "",
    status: "idle",
    avatarColor: "#6366f1",
    desk: { x: deskX, y: deskY, label: "FE", room: "Engineering" },
  };
}

describe("simulateOfficeLife", () => {
  it("sends the team to their desks on shift, then sits them in wait", () => {
    const casey = agent("a1");
    const map = new Map<string, LifeState>();
    ensureLife(map, casey, 0);
    const life = map.get("a1")!;
    life.x += 2;
    life.z += 2;

    for (let i = 0; i < 90; i++) {
      simulateOfficeLife(map, [casey], { a1: "walking" }, i * 0.05, 0.05, true);
    }

    const desk = atDesk(casey);
    assert.ok(Math.hypot(life.x - desk.x, life.z - desk.z) < 0.12);
    assert.equal(life.activity, "wait");
  });

  it("keeps coding after status flips idle (work hold)", () => {
    const casey = agent("a1");
    const map = new Map<string, LifeState>();
    ensureLife(map, casey, 0);
    const desk = atDesk(casey);
    const life = map.get("a1")!;
    life.x = desk.x;
    life.z = desk.z;

    simulateOfficeLife(map, [casey], { a1: "working" }, 1, 0.05, true);
    assert.equal(life.activity, "work");

    simulateOfficeLife(map, [casey], { a1: "idle" }, 2, 0.05, true);
    assert.equal(life.activity, "work");
  });
});
