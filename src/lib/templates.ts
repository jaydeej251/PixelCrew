import type { PositionKey } from "./constants";
import { DEFAULT_JOB_BOUNDARIES, POSITIONS } from "./constants";

export type TemplateAgent = {
  name: string;
  position: PositionKey;
  department: string;
  room: string;
};

export type TeamTemplate = {
  id: string;
  name: string;
  description: string;
  agents: TemplateAgent[];
};

export const TEAM_TEMPLATES: TeamTemplate[] = [
  {
    id: "lean",
    name: "Planning council",
    description:
      "Workspace AI staffs Product, Senior Dev, and UI/UX to brainstorm, then an engineer builds after you publish.",
    agents: [
      { name: "Avery", position: "dispatcher", department: "Product", room: "Reception" },
      { name: "Alex Chen", position: "project_manager", department: "Product", room: "Product" },
      { name: "Jordan Lee", position: "tech_architect", department: "Engineering", room: "Engineering" },
      { name: "Drew Santos", position: "designer", department: "Product", room: "Product" },
      { name: "Sam Rivera", position: "engineer", department: "Engineering", room: "Engineering" },
    ],
  },
  {
    id: "startup",
    name: "Startup Product Team",
    description: "Council plus specialized FE/BE and QA. Workspace AI still staffs and they still brainstorm first.",
    agents: [
      { name: "Avery", position: "dispatcher", department: "Product", room: "Reception" },
      { name: "Alex Chen", position: "project_manager", department: "Product", room: "Product" },
      { name: "Jordan Lee", position: "tech_architect", department: "Engineering", room: "Engineering" },
      { name: "Drew Santos", position: "designer", department: "Product", room: "Product" },
      { name: "Sam Rivera", position: "frontend_engineer", department: "Engineering", room: "Engineering" },
      { name: "Casey Kim", position: "frontend_engineer", department: "Engineering", room: "Engineering" },
      { name: "Morgan Patel", position: "backend_engineer", department: "Engineering", room: "Engineering" },
      { name: "Riley Nguyen", position: "backend_engineer", department: "Engineering", room: "Engineering" },
      { name: "Taylor Brooks", position: "qa_engineer", department: "QA", room: "QA" },
    ],
  },
  {
    id: "agency",
    name: "Agency Delivery",
    description: "Council plus FE/BE/QA. Same rule: the goal gets staffed and realized.",
    agents: [
      { name: "Avery", position: "dispatcher", department: "Product", room: "Reception" },
      { name: "Avery Walsh", position: "project_manager", department: "Product", room: "Product" },
      { name: "Jordan Lee", position: "tech_architect", department: "Engineering", room: "Engineering" },
      { name: "Drew Santos", position: "designer", department: "Product", room: "Product" },
      { name: "Quinn Hayes", position: "frontend_engineer", department: "Engineering", room: "Engineering" },
      { name: "Blake Foster", position: "backend_engineer", department: "Engineering", room: "Engineering" },
      { name: "Skyler Reed", position: "qa_engineer", department: "QA", room: "QA" },
    ],
  },
];

export function getPositionLabel(position: PositionKey): string {
  return POSITIONS[position];
}

export function getJobBoundary(position: PositionKey): string {
  return DEFAULT_JOB_BOUNDARIES[position];
}
