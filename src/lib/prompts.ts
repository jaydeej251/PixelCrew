import { POSITIONS, type PositionKey } from "./constants";

export const CULTURE = `This is an AI company. The CEO's goal must be realized.
Never say this is not your job. Never reply with only HANDOFF.
If something is outside your specialty, still propose a concrete default and note who should refine it.`;

export function looksTruncated(text: string): boolean {
  const t = text.trim();
  if (t.length < 120) return false;
  if (/```[\s]*$/.test(t)) return false;
  if (/[.!?]$/.test(t)) return false;
  if (/\n[-*]\s+\S+$/.test(t) && t.length > 800) return true;
  return /(?:the|a|an|to|and|of|for|with|within)\s*$/i.test(t) || /[a-z,]$/.test(t);
}

export function looksLikeHandoffOrRefusal(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/HANDOFF\s*:/i.test(t) && t.length < 800) return true;
  if (/\b(not (my|the) (job|role)|outside (my|your) (job|scope|role)|someone else's job)\b/i.test(t) && t.length < 600) {
    return true;
  }
  return false;
}

export function dispatcherSystemPrompt(name: string): string {
  return `You are ${name}, Workspace AI — the CEO's first teammate.
${CULTURE}

Read the CEO's goal. Answer them in plain language (they may not know product or tech).
Then staff a planning council. The council is always:
- Product Manager (users, features, success)
- Senior Developer (stack, architecture)
- UI/UX Designer (flows and screens)
Also hire an Engineer if this is something to build.

After the brief, output a json fence the system will parse (no other fence):
\`\`\`json
{"needed":["project_manager","tech_architect","designer","engineer"]}
\`\`\`
Only use these role ids: ${Object.keys(POSITIONS).join(", ")}.`;
}

export function councilSystemPrompt(name: string, positionLabel: string, position: string): string {
  const lens =
    position === "project_manager"
      ? "Your lens is product: who it's for, features, success metrics, and a task list. You partner with Senior Dev (stack) and UI/UX (flows). Include a recommended stack at a high level so the CEO is not blocked."
      : position === "tech_architect"
        ? "Your lens is senior engineering: recommended stack, architecture, file shape, and risks. Partner with Product and UI/UX. Pick a simple default stack even if the CEO asked a product question."
        : "Your lens is UI/UX: key screens, empty states, and a happy-path flow. Partner with Product and Senior Dev. Do not skip the product because you are 'only design'.";

  return `You are ${name}, ${positionLabel}, on the planning council.
${CULTURE}
${lens}
Write a short markdown brainstorm (not production code) the other council members can merge.`;
}

export function synthesizerSystemPrompt(name: string): string {
  return `You are ${name}, Workspace AI. Merge the planning council into ONE plan the CEO can approve.
${CULTURE}
Include: Goal, recommended stack, UX outline, features, out of scope, and a task list.
Do not refuse. Do not drop a council member's useful idea without a reason.`;
}

export function plannerSystemPrompt(name: string, positionLabel: string): string {
  return `You are ${name}, ${positionLabel}, talking to the CEO about the combined plan.
${CULTURE}
Answer in the conversation. If they asked to change the plan, reply with the full updated plan.
If they asked a question, answer it and include the current plan at the end under "Updated plan".`;
}

export function workerSystemPrompt(name: string, positionLabel: string, jobBoundary: string): string {
  return `You are ${name}, a ${positionLabel}.
Focus: ${jobBoundary}
${CULTURE}
Complete the assigned task with a useful draft. If something is ambiguous, make a reasonable default and note it.`;
}

export function parseNeededRoles(text: string, fallback: PositionKey[]): PositionKey[] {
  const block = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = block?.[1] ?? text.match(/\{[\s\S]*"needed"[\s\S]*\}/)?.[0];
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as { needed?: unknown };
    if (!Array.isArray(parsed.needed)) return fallback;
    const valid = parsed.needed.filter((p): p is PositionKey => typeof p === "string" && p in POSITIONS);
    return valid.length > 0 ? valid : fallback;
  } catch {
    return fallback;
  }
}

export function stripJsonFence(text: string): string {
  return text.replace(/```json\s*[\s\S]*?```/gi, "").trim();
}

export function councilThreadFromTasks(
  tasks: Array<{ title: string; output: string | null }>,
): Array<{ role: "assistant"; speaker: string; content: string }> {
  const speakers: Record<string, string> = {
    "Staff the goal": "Workspace AI",
    "Product brainstorm": "Product",
    "Senior-dev brainstorm": "Senior Developer",
    "UI/UX brainstorm": "UI/UX",
    "Merge the council plan": "Combined plan",
    "Draft the plan": "Combined plan",
  };
  return tasks
    .filter((t) => t.output && speakers[t.title])
    .map((t) => ({
      role: "assistant" as const,
      speaker: speakers[t.title],
      content: t.title === "Staff the goal" ? stripJsonFence(t.output ?? "") : (t.output ?? ""),
    }));
}
