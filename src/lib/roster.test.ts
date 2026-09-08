import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Agent } from "@prisma/client";
import {
  buildersOnTeam,
  engineeringAssignment,
  filterAutoHireRoles,
  isSoloSeniorBuild,
} from "./roster";

function agent(position: string, id = position): Agent {
  return {
    id,
    name: position,
    position,
    positionLabel: position,
    jobBoundary: "",
    avatarColor: "#000",
    status: "idle",
    workspaceId: "ws",
    deskId: null,
    departmentId: null,
    provider: "mock",
    model: "mock",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Agent;
}

describe("filterAutoHireRoles", () => {
  it("does not auto-hire engineer when senior is in the staffing batch", () => {
    const filtered = filterAutoHireRoles(
      [],
      ["project_manager", "tech_architect", "designer", "engineer"],
    );
    assert.deepEqual(filtered, ["project_manager", "tech_architect", "designer"]);
  });

  it("does not re-hire engineer when senior already on roster", () => {
    const filtered = filterAutoHireRoles(
      [{ position: "tech_architect" }],
      ["engineer", "frontend_engineer", "backend_engineer"],
    );
    assert.deepEqual(filtered, []);
  });

  it("does not hire FE/BE when generalist engineer is requested or present", () => {
    assert.deepEqual(
      filterAutoHireRoles([], ["engineer", "frontend_engineer", "backend_engineer"]),
      ["engineer"],
    );
    assert.deepEqual(
      filterAutoHireRoles([{ position: "engineer" }], ["frontend_engineer", "backend_engineer"]),
      [],
    );
  });

  it("still hires engineer when no senior or specialist exists", () => {
    assert.deepEqual(filterAutoHireRoles([], ["engineer"]), ["engineer"]);
  });

  it("keeps FE/BE already on the roster (no-op ensure)", () => {
    assert.deepEqual(
      filterAutoHireRoles(
        [{ position: "frontend_engineer" }, { position: "backend_engineer" }],
        ["frontend_engineer", "backend_engineer", "engineer"],
      ),
      ["frontend_engineer", "backend_engineer"],
    );
  });
});

describe("engineeringAssignment", () => {
  it("assigns solo build to senior when no engineer seats exist", () => {
    const assignment = engineeringAssignment([agent("tech_architect"), agent("designer")]);
    assert.equal(assignment.mode, "solo");
    assert.equal(assignment.soloPosition, "tech_architect");
    assert.equal(isSoloSeniorBuild(assignment), true);
  });

  it("prefers real engineers over senior for build", () => {
    const assignment = engineeringAssignment([
      agent("tech_architect"),
      agent("engineer"),
    ]);
    assert.equal(assignment.mode, "solo");
    assert.equal(assignment.soloPosition, "engineer");
    assert.equal(isSoloSeniorBuild(assignment), false);
  });

  it("splits when FE and BE exist", () => {
    const assignment = engineeringAssignment([
      agent("frontend_engineer"),
      agent("backend_engineer"),
    ]);
    assert.equal(assignment.mode, "split");
  });
});

describe("buildersOnTeam", () => {
  it("falls back to senior when engineers are absent", () => {
    const builders = buildersOnTeam([agent("tech_architect"), agent("project_manager")]);
    assert.equal(builders.length, 1);
    assert.equal(builders[0].position, "tech_architect");
  });
});
