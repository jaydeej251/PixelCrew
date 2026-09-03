import { ENGINEER_POSITIONS } from "../roster";
import type { LLMProvider, ChatMessage, StreamChunk } from "./types";
import { toFileFences } from "../project-files";
import {
  MOCK_BACKEND_FILES,
  mockProjectForGoal,
} from "../mock-project";
import { PLAN_DRAFT_TITLE, SYNTHESIZE_TITLE } from "../workflow";

function mockSynthPlan(ceoGoal: string): string {
  const goal = ceoGoal.trim() || "A personal budget tracker so one person can see spend vs a monthly cap.";
  return `# Goal
${goal}

# Stack
Static HTML + CSS + JS. Collections stored as a JSON array in localStorage.

# UX
Landing → primary action → list/empty state.

# Features
Capture items for the goal, persist locally, show leftover/status.

# Out of scope
Bank sync, login, multiple people.

# Task list
- Product Manager: copy and success.
- UI/UX Designer: layout tokens and empty states.
- Senior Developer: file list (index.html, styles.css, app.js).
- Engineer: build and test the static app in one sitting.

\`\`\`json
{"decisions":[{"id":"tone","prompt":"How should the product feel on first open?","why":"This changes copy and emphasis.","options":[{"id":"calm","label":"Calm and clear","recommended":true},{"id":"bold","label":"Bold and energetic"}]}]}
\`\`\`
`;
}

function mockResponses(ceoGoal: string): Record<string, string[]> {
  const project = mockProjectForGoal(ceoGoal);
  const frontend = {
    "index.html": project["index.html"]!,
    "styles.css": project["styles.css"]!,
    "app.js": project["app.js"]!,
  };
  return {
    dispatcher: [
      "Got it — we'll treat this as a real product goal and staff a planning council.",
      "Product, Senior Dev, and UI/UX will brainstorm; I'll merge their takes for you.",
      "```json\n{\"needed\":[\"project_manager\",\"tech_architect\",\"designer\",\"engineer\"]}\n```",
    ],
    project_manager: [
      `Product take: ship a focused v1 for: ${ceoGoal.trim() || "the CEO goal"}.`,
      "Features: primary action + list view. Effort: one sitting. Stack suggestion: static HTML/CSS/JS.",
    ],
    tech_architect: [
      "Senior take: static HTML + CSS + JS. Persist collections as a JSON array in localStorage (parse, push, save).",
      "Files: index.html, styles.css, app.js. Bind submit with addEventListener. No inline onclick.",
    ],
    designer: [
      "UX take: onboarding → primary screen → add form → list.",
      "Empty state: 'Nothing here yet — add the first item.'",
    ],
    engineer: [toFileFences(project)],
    frontend_engineer: [toFileFences(frontend)],
    backend_engineer: [toFileFences(MOCK_BACKEND_FILES)],
    qa_engineer: [
      "Verdict: PASS",
      "Checked the emitted files against the goal. Contact/data persistence appends to a localStorage array, CTAs use in-page hrefs, no inline handlers.",
    ],
    executive: [
      "Clarifying the CEO goal and success criteria.",
      "Drafting a concise company plan for the team.",
    ],
  };
}

export class MockProvider implements LLMProvider {
  constructor(
    private position: string,
    private taskTitle: string,
    private ceoGoal = "",
  ) {}

  async stream(
    _messages: ChatMessage[],
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<StreamChunk> {
    const responses = mockResponses(this.ceoGoal);
    const lines =
      this.taskTitle === SYNTHESIZE_TITLE || this.taskTitle === PLAN_DRAFT_TITLE
        ? [mockSynthPlan(this.ceoGoal)]
        : responses[this.position] ?? [
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
