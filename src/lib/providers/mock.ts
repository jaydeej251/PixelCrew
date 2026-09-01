import { ENGINEER_POSITIONS } from "../roster";
import type { LLMProvider, ChatMessage, StreamChunk } from "./types";
import { toFileFences } from "../project-files";
import { MOCK_BACKEND_FILES, MOCK_BUDGET_TRACKER, MOCK_FRONTEND_FILES } from "../mock-project";

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
  engineer: [toFileFences(MOCK_BUDGET_TRACKER)],
  frontend_engineer: [toFileFences(MOCK_FRONTEND_FILES)],
  backend_engineer: [toFileFences(MOCK_BACKEND_FILES)],
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
    const long = ENGINEER_POSITIONS.includes(
      this.position as (typeof ENGINEER_POSITIONS)[number],
    );
    let full = "";
    for (const line of lines) {
      if (long) {
        const chunkSize = 80;
        for (let i = 0; i < line.length; i += chunkSize) {
          await delay(8);
          const chunk = line.slice(i, i + chunkSize);
          full += chunk;
          onChunk({ content: chunk });
        }
        full += "\n";
        onChunk({ content: "\n" });
        continue;
      }
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
