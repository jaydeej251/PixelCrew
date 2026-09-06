import type { ChatMessage } from "./providers/types";

/** Soft caps for plan-review LLM calls (output reservation + prompt shaping). */
export const PLAN_ASK_MAX_TOKENS = 2000;
export const PLAN_DECIDE_MAX_TOKENS = 1800;

/** Keep the live combined plan pinned; older council dumps get digested. */
export const PINNED_PLAN_CHARS = 8_000;
export const COUNCIL_DIGEST_CHARS = 1_000;
export const RECENT_TURN_CHARS = 2_500;
export const MAX_RECENT_DIALOGUE_TURNS = 6;

const COMBINED_PLAN_SPEAKERS = new Set(["Combined plan", "Plan"]);

export type PlanThreadItem = {
  role: "user" | "assistant";
  content: string;
  speaker?: string;
};

export function truncateForPrompt(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const marker = "\n…[truncated]";
  const bodyBudget = Math.max(0, maxChars - marker.length);
  if (bodyBudget === 0) return marker.trimStart().slice(0, maxChars);
  return `${trimmed.slice(0, bodyBudget).trimEnd()}${marker}`;
}

/**
 * Prefer keeping markdown section headers when truncating a combined plan so
 * Goal / stack / UX / tasks survive soft cuts.
 */
export function truncatePlanForPrompt(plan: string, maxChars = PINNED_PLAN_CHARS): string {
  const trimmed = plan.trim();
  if (trimmed.length <= maxChars) return trimmed;

  const sections = trimmed.split(/(?=^#{1,3}\s)/m).filter(Boolean);
  if (sections.length <= 1) return truncateForPrompt(trimmed, maxChars);

  let out = "";
  for (const section of sections) {
    const next = out ? `${out}\n\n${section.trim()}` : section.trim();
    if (next.length > maxChars) {
      if (!out) return truncateForPrompt(section, maxChars);
      break;
    }
    out = next;
  }
  return out || truncateForPrompt(trimmed, maxChars);
}

function isCombinedPlanMessage(item: PlanThreadItem): boolean {
  if (item.role !== "assistant") return false;
  if (item.speaker && COMBINED_PLAN_SPEAKERS.has(item.speaker)) return true;
  return /^#\s*goal\b/im.test(item.content) && item.content.length > 400;
}

function isCouncilBrainstorm(item: PlanThreadItem): boolean {
  if (item.role !== "assistant") return false;
  if (!item.speaker) return false;
  return ["Workspace AI", "Product", "Senior Developer", "UI/UX"].includes(item.speaker);
}

function digestBrainstorm(item: PlanThreadItem): string {
  const body = truncateForPrompt(item.content, COUNCIL_DIGEST_CHARS);
  return `[${item.speaker} digest]\n${body}`;
}

/**
 * Build a token-efficient plan-ask prompt:
 * - pin the current combined plan once (source of truth for revises)
 * - compress older council brainstorms into short digests (memoized shape)
 * - keep only the latest N dialogue turns at fuller fidelity
 */
export function buildPlanAskMessages(input: {
  systemPrompt: string;
  thread: PlanThreadItem[];
  currentPlan: string;
  ceoGoal?: string;
}): ChatMessage[] {
  const plan = truncatePlanForPrompt(input.currentPlan || "");
  const goal = (input.ceoGoal ?? "").trim();

  const combinedIdx = (() => {
    for (let i = input.thread.length - 1; i >= 0; i--) {
      if (isCombinedPlanMessage(input.thread[i]!)) return i;
    }
    return -1;
  })();

  const councilDigests: string[] = [];
  const dialogue: PlanThreadItem[] = [];

  for (let i = 0; i < input.thread.length; i++) {
    const item = input.thread[i]!;
    if (i === combinedIdx) continue;
    if (isCouncilBrainstorm(item) && i < combinedIdx) {
      councilDigests.push(digestBrainstorm(item));
      continue;
    }
    dialogue.push(item);
  }

  const recent = dialogue.slice(-MAX_RECENT_DIALOGUE_TURNS);
  const skipped = dialogue.length - recent.length;

  const pinned: string[] = [
    "Token-efficient context (do not ask the CEO to restate this):",
    goal ? `CEO goal:\n${truncateForPrompt(goal, 1_500)}` : "",
    plan
      ? `Current combined plan (source of truth — revise this when the CEO asks for changes):\n${plan}`
      : "Current combined plan: (not saved yet — use the council digests and dialogue.)",
    councilDigests.length
      ? `Earlier council digests (compressed; details live in the combined plan):\n${councilDigests.join("\n\n")}`
      : "",
    skipped > 0
      ? `(${skipped} earlier Q&A turn${skipped === 1 ? "" : "s"} omitted — answer from the pinned plan + recent turns.)`
      : "",
  ].filter(Boolean);

  const history = recent.map((m) => ({
    role: m.role,
    content: truncateForPrompt(
      m.speaker ? `[${m.speaker}]\n${m.content}` : m.content,
      RECENT_TURN_CHARS,
    ),
  }));

  return [
    { role: "system", content: input.systemPrompt },
    { role: "user", content: pinned.join("\n\n") },
    ...history,
  ];
}
