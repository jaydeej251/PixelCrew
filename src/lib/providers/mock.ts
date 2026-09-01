import type { LLMProvider, ChatMessage, StreamChunk } from "./types";

const MOCK_RESPONSES: Record<string, string[]> = {
  dispatcher: [
    "Got it — we'll treat this as a real product goal and staff a planning council.",
    "Product, Senior Dev, and UI/UX will brainstorm; I'll merge their takes for you.",
    "```json\n{\"needed\":[\"project_manager\",\"tech_architect\",\"designer\",\"engineer\"]}\n```",
  ],
  project_manager: [
    "Product take: simple budget tracker for one person, weekly spend vs budget.",
    "Features: accounts, categories, add expense, month view. Stack suggestion: Next.js + Postgres.",
  ],
  tech_architect: [
    "Senior take: Next.js + Postgres + Prisma. One deploy, SQLite later if we must go local.",
    "Keep auth optional in v1 so the CEO can try it same day.",
  ],
  designer: [
    "UX take: onboarding → today's spend → add expense sheet → month chart.",
    "Empty state: 'No expenses yet — add coffee or rent to see the month.'",
  ],
  engineer: [
    "Implementing the assigned work from the published plan.",
    "Covering frontend and backend as needed for this roster.",
  ],
  frontend_engineer: [
    "Scaffolding the dashboard layout component.",
    "Implementing the habit tracker UI with form validation.",
    "Wiring up client-side state for daily entries.",
  ],
  backend_engineer: [
    "Designing the habits API endpoints.",
    "Implementing auth middleware and session handling.",
    "Creating Prisma models for habits and users.",
  ],
  qa_engineer: [
    "Drafting test cases for login and habit CRUD.",
    "Reviewing API contract against PRD requirements.",
    "Filing issues for edge cases in date handling.",
  ],
  executive: [
    "Clarifying the CEO goal and success criteria.",
    "Drafting a concise company plan for the team.",
  ],
};

export class MockProvider implements LLMProvider {
  constructor(
    private position: string,
    private taskTitle: string,
  ) {}

  async stream(
    _messages: ChatMessage[],
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<StreamChunk> {
    const lines =
      MOCK_RESPONSES[this.position] ?? [
        `Working on: ${this.taskTitle}`,
        "Making a useful default so the CEO goal still moves.",
      ];
    let full = "";
    for (const line of lines) {
      const words = line.split(" ");
      for (const word of words) {
        await delay(40);
        const chunk = `${word} `;
        full += chunk;
        onChunk({ content: chunk });
      }
      full += "\n";
      onChunk({ content: "\n" });
    }
    return { content: full, done: true, inputTokens: 120, outputTokens: 80 };
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
