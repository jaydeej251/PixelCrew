export const PRODUCT_NAME = process.env.PRODUCT_NAME ?? "PixelCrew";

export const DEFAULT_CONCURRENCY_CAP = 8;

export const POSITIONS = {
  project_manager: "Project Manager",
  tech_architect: "Tech Architect",
  frontend_engineer: "Frontend Engineer",
  backend_engineer: "Backend Engineer",
  qa_engineer: "QA Engineer",
  designer: "Designer",
} as const;

export type PositionKey = keyof typeof POSITIONS;

export const DEFAULT_JOB_BOUNDARIES: Record<PositionKey, string> = {
  project_manager:
    "Turn CEO goals into PRDs and task lists. Coordinate handoffs. Do not write code or choose implementation details.",
  tech_architect:
    "Choose stack, architecture, and file structure. Do not implement features or write UI code.",
  frontend_engineer:
    "Implement UI components and pages only within the architect's structure. Do not write backend APIs.",
  backend_engineer:
    "Implement APIs, data models, and server logic only. Do not write frontend UI code.",
  qa_engineer:
    "Write test plans, review outputs, and file issues. Do not rewrite features or architecture.",
  designer:
    "Define UX flows, wireframes, and visual direction. Do not write production code.",
};

export const AVATAR_COLORS = [
  "#8b5cf6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#6366f1",
  "#14b8a6",
];

export const OFFICE_ROOMS = ["Executive", "Product", "Engineering", "QA"] as const;

export const DEFAULT_DESKS = [
  { label: "CEO Desk", x: 2, y: 1, room: "Executive" },
  { label: "PM-1", x: 1, y: 3, room: "Product" },
  { label: "PM-2", x: 3, y: 3, room: "Product" },
  { label: "Arch-1", x: 1, y: 5, room: "Engineering" },
  { label: "FE-1", x: 3, y: 5, room: "Engineering" },
  { label: "FE-2", x: 5, y: 5, room: "Engineering" },
  { label: "BE-1", x: 1, y: 7, room: "Engineering" },
  { label: "BE-2", x: 3, y: 7, room: "Engineering" },
  { label: "QA-1", x: 5, y: 7, room: "QA" },
  { label: "QA-2", x: 7, y: 7, room: "QA" },
] as const;
