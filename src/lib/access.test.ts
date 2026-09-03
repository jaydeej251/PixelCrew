import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agentAccessWhere, runAccessWhere, workspaceAccessWhere } from "./access";

describe("organization access filters", () => {
  const organization = { organizationId: "org_a" };

  it("always combines a workspace ID with the session organization", () => {
    assert.deepEqual(workspaceAccessWhere("workspace_b", organization), {
      id: "workspace_b",
      organizationId: "org_a",
    });
  });

  it("scopes runs through their workspace organization and excludes archives", () => {
    assert.deepEqual(runAccessWhere("run_b", organization), {
      id: "run_b",
      archivedAt: null,
      workspace: { organizationId: "org_a" },
    });
  });

  it("scopes agents through their workspace organization", () => {
    assert.deepEqual(agentAccessWhere("agent_b", organization), {
      id: "agent_b",
      workspace: { organizationId: "org_a" },
    });
  });
});
