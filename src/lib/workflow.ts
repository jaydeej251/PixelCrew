import {
  COUNCIL_POSITIONS,
  DISPATCHER_POSITION,
  BUILD_STAGE_POSITIONS,
  REVIEWER_POSITIONS,
} from "./roster";

export type WorkflowNode = {
  id: string;
  position: string;
  title: string;
  dependsOn: string[];
};

export type WorkflowGraph = {
  nodes: WorkflowNode[];
};

export type WorkflowStage = {
  id: string;
  label: string;
  positions: string[];
  maxParallel: number;
};

export const WORKFLOW_STAGES: WorkflowStage[] = [
  {
    id: "dispatch",
    label: "Workspace AI",
    positions: [DISPATCHER_POSITION],
    maxParallel: 1,
  },
  {
    id: "council",
    label: "Planning council",
    positions: [...COUNCIL_POSITIONS],
    maxParallel: 2,
  },
  {
    id: "synthesize",
    label: "Combined plan",
    positions: [DISPATCHER_POSITION],
    maxParallel: 1,
  },
  {
    id: "review",
    label: "Review & delegate",
    positions: [...REVIEWER_POSITIONS],
    maxParallel: 1,
  },
  {
    id: "build",
    label: "Engineering",
    positions: [...BUILD_STAGE_POSITIONS],
    maxParallel: 2,
  },
  {
    id: "qa",
    label: "QA",
    positions: ["qa_engineer"],
    maxParallel: 1,
  },
];

export const PRE_PUBLISH_STAGES = new Set(["dispatch", "council", "synthesize"]);
export const POST_PUBLISH_STAGES = new Set(["review", "build", "qa"]);

export function buildWorkflowGraph(
  tasks: Array<{ id: string; position: string; title: string; dependsOnIds: string[] }>,
): WorkflowGraph {
  return {
    nodes: tasks.map((t) => ({
      id: t.id,
      position: t.position,
      title: t.title,
      dependsOn: t.dependsOnIds,
    })),
  };
}

export const DEFAULT_MAX_CONCURRENT_LLM = 2;

export {
  TOKEN_SOFT_GATE,
  TOKEN_HARD_GATE,
  TOKEN_HARD_GATE as DEFAULT_TOKEN_BUDGET,
} from "./token-spend-gate";

export const DISPATCH_TITLE = "Staff the goal";
export const COUNCIL_PRODUCT_TITLE = "Product brainstorm";
export const COUNCIL_SENIOR_TITLE = "Senior-dev brainstorm";
export const COUNCIL_UX_TITLE = "UI/UX brainstorm";
export const SYNTHESIZE_TITLE = "Merge the council plan";
export const PLAN_DRAFT_TITLE = "Draft the plan";
export const PLAN_QA_TITLE = "Plan Q&A";
export const PLAN_DECISIONS_TITLE = "Plan decisions";
export const PLAN_PUBLISHED_TITLE = "Plan published";

export function pickPlanTask<T extends { title: string; status: string }>(tasks: T[]): T | undefined {
  return (
    tasks.find((t) => t.title === SYNTHESIZE_TITLE && t.status === "done") ??
    tasks.find((t) => t.title === PLAN_DRAFT_TITLE && t.status === "done")
  );
}
