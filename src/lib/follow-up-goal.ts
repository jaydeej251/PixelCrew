/** Marker appended by Request changes (dashboard). Keep in sync with UI. */
export const CHANGES_I_WANT_MARKER = "\n\nChanges I want:\n";

export const FOLLOW_UP_IMPLEMENT_TITLE = "Apply requested changes";
export const FOLLOW_UP_FROM_RUN_TITLE = "Follow-up from prior run";

export function isFollowUpGoal(goal: string | null | undefined): boolean {
  return Boolean(goal && goal.includes(CHANGES_I_WANT_MARKER.trim()));
}

export function isFollowUpImplementTitle(title: string): boolean {
  return title === FOLLOW_UP_IMPLEMENT_TITLE || /^Apply requested changes\b/i.test(title);
}

export function parseFollowUpGoal(goal: string): {
  baseGoal: string;
  changes: string;
  isFollowUp: boolean;
} {
  const marker = CHANGES_I_WANT_MARKER.trim();
  const idx = goal.indexOf(marker);
  if (idx < 0) {
    return { baseGoal: goal.trim(), changes: "", isFollowUp: false };
  }
  return {
    baseGoal: goal.slice(0, idx).trim(),
    changes: goal.slice(idx + marker.length).trim(),
    isFollowUp: true,
  };
}

/** Surgical patch prompt — Request changes must not redesign the whole app. */
export function followUpFixSystemPrompt(name: string, positionLabel: string): string {
  return `You are ${name}, ${positionLabel}, applying a surgical Request-changes patch.
This is NOT a new product and NOT a redesign.

Rules:
- You receive CURRENT shipped files and a short "Changes I want" list from the CEO.
- Fix ONLY what they asked for. Preserve layout, theme, copy, structure, and working behavior elsewhere.
- Emit ONLY files you must change as complete \`\`\`file:path fences. Do NOT re-emit unchanged files.
- Do NOT rebuild the app from scratch. Do NOT restyle the whole UI. Do NOT add features they did not ask for.
- If a bug fix needs a small related wiring change, keep it minimal and local.
- Static HTML/CSS/JS only. No Tailwind CDN, no type="module", no secrets.
- Prefer the smallest diff that makes the requested change work in Preview.`;
}

/** Auto-publish plan for Request-changes — skips council×3+synth LLM burn. */
export function surgicalFollowUpPlan(ceoGoal: string): string {
  const { baseGoal, changes } = parseFollowUpGoal(ceoGoal);
  const product = (baseGoal || "the existing product").slice(0, 400);
  const patch = (changes || "the requested change").slice(0, 800);
  return `# Request changes (surgical patch)

## Goal
Preserve the existing app for: ${product}

Apply only this change list from the CEO: ${patch}

## Recommended stack
Static HTML + CSS + JS with localStorage (same as the current shipped app).

## UX outline
No redesign. Preserve current screens, theme, and copy. Touch only what the change list requires.

## Features
- Apply the CEO change list above
- Keep all other existing behavior unchanged

## Out of scope
Visual redesign, new theme, unrelated features, full rewrite, marketing landing templates.

## Task list
1. Engineer: Apply requested changes to current files only (emit changed files).
2. QA: Verify the requested change works; do not demand a redesign.

Hours, not days — this is a patch session on an existing static page.
`;
}
