export const PRODUCT_NAME = process.env.PRODUCT_NAME ?? "PixelCrew";

export const DEFAULT_CONCURRENCY_CAP = 2;

export const POSITIONS = {
  dispatcher: "Workspace AI",
  executive: "Executive",
  project_manager: "Product Manager",
  designer: "UI/UX Designer",
  tech_architect: "Senior Developer",
  engineer: "Engineer",
  frontend_engineer: "Frontend Engineer",
  backend_engineer: "Backend Engineer",
  qa_engineer: "QA Engineer",
} as const;

export type PositionKey = keyof typeof POSITIONS;

export const DEFAULT_HIRE_NAMES: Record<PositionKey, string> = {
  dispatcher: "Avery",
  executive: "Riley Fox",
  project_manager: "Alex Chen",
  designer: "Drew Santos",
  tech_architect: "Jordan Lee",
  engineer: "Sam Rivera",
  frontend_engineer: "Casey Kim",
  backend_engineer: "Morgan Patel",
  qa_engineer: "Taylor Brooks",
};

export const DEFAULT_JOB_BOUNDARIES: Record<PositionKey, string> = {
  dispatcher:
    "First to read the CEO. Staff whoever is needed, answer in plain language, and make sure the goal is realized. Never refuse.",
  executive:
    "Set direction. If product is missing, you plan. Never say the goal is someone else's problem.",
  project_manager:
    "Own the product take: users, features, success metrics, and a task list. Partner with Senior Dev and UI/UX. Never refuse a CEO question — propose a default.",
  designer:
    "Own UX flows, screens, and empty states. Partner with Product and Senior Dev. Never refuse — sketch a default.",
  tech_architect:
    "Own stack, architecture, and risks. Partner with Product and UI/UX. Recommend a simple stack even when the CEO is unsure. Never refuse.",
  engineer:
    "Implement whatever the plan requires — frontend, backend, or both — because you may be the only engineer.",
  frontend_engineer:
    "Implement UI. If you are the only engineer, also cover backend drafts so the goal still ships.",
  backend_engineer:
    "Implement APIs and data. If you are the only engineer, also cover UI drafts so the goal still ships.",
  qa_engineer:
    "Write test plans, review outputs, and file issues. If QA would block the goal, note gaps and still ship a plan.",
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
  { label: "HQ AI", x: 4, y: 1, room: "Executive" },
  { label: "PM-1", x: 1, y: 3, room: "Product" },
  { label: "PM-2", x: 3, y: 3, room: "Product" },
  { label: "UX-1", x: 5, y: 3, room: "Product" },
  { label: "Arch-1", x: 1, y: 5, room: "Engineering" },
  { label: "FE-1", x: 3, y: 5, room: "Engineering" },
  { label: "FE-2", x: 5, y: 5, room: "Engineering" },
  { label: "BE-1", x: 1, y: 7, room: "Engineering" },
  { label: "BE-2", x: 3, y: 7, room: "Engineering" },
  { label: "QA-1", x: 5, y: 7, room: "QA" },
  { label: "QA-2", x: 7, y: 7, room: "QA" },
] as const;
