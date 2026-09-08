import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OfficeAgent } from "../../lib/office";
import {
  activityLabel,
  atDesk,
  atFrontDoor,
  atPlanningSeat,
  ensureLife,
  simulateOfficeLife,
  workBadgeLabel,
  type LifeState,
} from "./office-life";

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
  it("spawns walking agents at the front door, then walks to the desk", () => {
    const casey = agent("a1");
    const map = new Map<string, LifeState>();
    ensureLife(map, casey, 0, "walking");
    const life = map.get("a1")!;
    const door = atFrontDoor();
    const desk = atDesk(casey);

    assert.ok(Math.hypot(life.x - door.x, life.z - door.z) < 0.05);
    assert.equal(life.activity, "walk");

    for (let i = 0; i < 120; i++) {
      simulateOfficeLife(map, [casey], { a1: "walking" }, i * 0.05, 0.05, false);
    }

    assert.ok(Math.hypot(life.x - desk.x, life.z - desk.z) < 0.12);
    assert.equal(life.activity, "wait");
  });

  it("still seats idle agents at their desk on first spawn", () => {
    const casey = agent("a1");
    const map = new Map<string, LifeState>();
    ensureLife(map, casey, 0, "idle");
    const life = map.get("a1")!;
    const desk = atDesk(casey);
    assert.ok(Math.hypot(life.x - desk.x, life.z - desk.z) < 0.05);
    assert.equal(life.activity, "stand");
  });

  it("walks to the desk only after a task is claimed, then waits", () => {
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

  it("keeps roaming while a run is on if it is not their turn", () => {
    const casey = agent("a1");
    const map = new Map<string, LifeState>();
    ensureLife(map, casey, 0);
    const life = map.get("a1")!;
    life.x += 1.4;
    life.z += 1.1;

    for (let i = 0; i < 40; i++) {
      simulateOfficeLife(map, [casey], { a1: "idle" }, i * 0.05, 0.05, true);
    }

    assert.notEqual(life.activity, "wait");
    assert.notEqual(life.activity, "work");
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

  it("gets up and leaves the desk after the work hold ends", () => {
    const casey = agent("a1");
    const map = new Map<string, LifeState>();
    ensureLife(map, casey, 0);
    const desk = atDesk(casey);
    const life = map.get("a1")!;
    life.x = desk.x;
    life.z = desk.z;

    simulateOfficeLife(map, [casey], { a1: "working" }, 1, 0.05, true);
    simulateOfficeLife(map, [casey], { a1: "idle" }, 10, 0.05, true);

    assert.notEqual(life.activity, "work");
    assert.notEqual(life.activity, "wait");
  });

  it("sends planners to the meeting room while planning is on", () => {
    const riley = planner("e1");
    const map = new Map<string, LifeState>();
    ensureLife(map, riley, 0);
    const life = map.get("e1")!;
    const desk = atDesk(riley);
    life.x = desk.x;
    life.z = desk.z;

    for (let i = 0; i < 90; i++) {
      simulateOfficeLife(map, [riley], { e1: "idle" }, i * 0.05, 0.05, true);
    }

    const seat = atPlanningSeat(riley, 0);
    assert.ok(Math.hypot(life.x - seat.x, life.z - seat.z) < 0.12);
    assert.equal(life.activity, "meet");
    assert.ok(Math.hypot(life.x - desk.x, life.z - desk.z) > 1);
  });

  it("walks a newly hired planner from the door into the planning meeting", () => {
    const riley = planner("e1");
    const map = new Map<string, LifeState>();
    ensureLife(map, riley, 0, "walking");
    const life = map.get("e1")!;
    const door = atFrontDoor();
    assert.ok(Math.hypot(life.x - door.x, life.z - door.z) < 0.05);

    for (let i = 0; i < 120; i++) {
      simulateOfficeLife(map, [riley], { e1: "walking" }, i * 0.05, 0.05, true);
    }

    const seat = atPlanningSeat(riley, 0);
    assert.ok(Math.hypot(life.x - seat.x, life.z - seat.z) < 0.12);
    assert.equal(life.activity, "meet");
  });

  it("never seats an executive at a coding desk even when working", () => {
    const riley = planner("e1");
    const map = new Map<string, LifeState>();
    ensureLife(map, riley, 0);
    const desk = atDesk(riley);
    const life = map.get("e1")!;
    life.x = desk.x + 2;
    life.z = desk.z + 2;

    for (let i = 0; i < 90; i++) {
      simulateOfficeLife(map, [riley], { e1: "working" }, i * 0.05, 0.05, false);
    }

    assert.equal(life.activity, "meet");
    assert.notEqual(life.activity, "work");
  });

  it("seats Senior Developer at a coding desk when working after plan publish", () => {
    const jordan = seniorDev("j1");
    const map = new Map<string, LifeState>();
    ensureLife(map, jordan, 0);
    const desk = atDesk(jordan);
    const life = map.get("j1")!;
    life.x = desk.x + 2;
    life.z = desk.z + 2;

    for (let i = 0; i < 90; i++) {
      simulateOfficeLife(map, [jordan], { j1: "working" }, i * 0.05, 0.05, false);
    }

    assert.equal(life.activity, "work");
    assert.ok(Math.hypot(life.x - desk.x, life.z - desk.z) < 0.15);
  });

  it("keeps Senior Developer in planning while the plan is open", () => {
    const jordan = seniorDev("j1");
    const map = new Map<string, LifeState>();
    ensureLife(map, jordan, 0);
    const life = map.get("j1")!;

    for (let i = 0; i < 90; i++) {
      simulateOfficeLife(map, [jordan], { j1: "working" }, i * 0.05, 0.05, true);
    }

    assert.equal(life.activity, "meet");
  });
});

describe("activity labels", () => {
  it("marks QA work as reviewing", () => {
    assert.equal(activityLabel("Sam", "work", "qa_engineer"), "Sam · reviewing");
    assert.equal(activityLabel("Casey", "work", "frontend_engineer"), "Casey · coding");
    assert.equal(workBadgeLabel("qa_engineer"), "QA");
    assert.equal(workBadgeLabel("frontend_engineer"), "CODING");
  });
});

function planner(id: string): OfficeAgent {
  return {
    id,
    name: "Riley Fox",
    position: "executive",
    positionLabel: "Executive",
    jobBoundary: "",
    status: "idle",
    avatarColor: "#f59e0b",
    desk: { x: 1, y: 5, label: "CEO Desk", room: "Executive" },
  };
}

function seniorDev(id: string): OfficeAgent {
  return {
    id,
    name: "Jordan Lee",
    position: "tech_architect",
    positionLabel: "Senior Developer",
    jobBoundary: "",
    status: "idle",
    avatarColor: "#22c55e",
    desk: { x: 6, y: 4, label: "Arch Desk", room: "Engineering" },
  };
}
