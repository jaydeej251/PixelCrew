export type WorkflowNode = {
  id: string;
  position: string;
  title: string;
  dependsOn: string[];
};

export type WorkflowGraph = {
  nodes: WorkflowNode[];
};

export function buildWorkflowGraph(tasks: Array<{ id: string; position: string; title: string; dependsOnIds: string[] }>): WorkflowGraph {
  return {
    nodes: tasks.map((t) => ({
      id: t.id,
      position: t.position,
      title: t.title,
      dependsOn: t.dependsOnIds,
    })),
  };
}

export function getReadyNodes(graph: WorkflowGraph, completed: Set<string>): WorkflowNode[] {
  return graph.nodes.filter(
    (n) => !completed.has(n.id) && n.dependsOn.every((d) => completed.has(d)),
  );
}
