export type OrganizationScope = {
  organizationId: string;
};

export function workspaceAccessWhere(workspaceId: string, scope: OrganizationScope) {
  return { id: workspaceId, organizationId: scope.organizationId };
}

export function runAccessWhere(runId: string, scope: OrganizationScope) {
  return {
    id: runId,
    archivedAt: null,
    workspace: { organizationId: scope.organizationId },
  };
}

export function agentAccessWhere(agentId: string, scope: OrganizationScope) {
  return {
    id: agentId,
    workspace: { organizationId: scope.organizationId },
  };
}
