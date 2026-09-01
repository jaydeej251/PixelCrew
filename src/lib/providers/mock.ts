import type { LLMProvider, ChatMessage, StreamChunk } from "./types";

const MOCK_RESPONSES: Record<string, string[]> = {
  project_manager: [
    "Breaking down the CEO goal into a PRD outline...",
    "Creating user stories and acceptance criteria.",
    "Queuing frontend and backend tasks for parallel execution.",
  ],
  tech_architect: [
    "Selecting Next.js + Postgres for the stack.",
    "Defining folder structure and API contracts.",
    "Documenting architecture decisions.",
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
  designer: [
    "Sketching onboarding flow wireframes.",
    "Defining color tokens and typography scale.",
    "Creating component spacing guidelines.",
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
        "Staying within my job boundary.",
        "Ready to hand off if needed.",
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
