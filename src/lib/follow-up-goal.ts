/** Marker appended by Request changes (dashboard). Keep in sync with UI. */
export const CHANGES_I_WANT_MARKER = "\n\nChanges I want:\n";

export const FOLLOW_UP_IMPLEMENT_TITLE = "Apply requested changes";
export const FOLLOW_UP_UI_TITLE = "Apply UI refresh";
export const FOLLOW_UP_FROM_RUN_TITLE = "Follow-up from prior run";
/** Artifact written each same-chat Request changes iteration. */
export const REQUEST_CHANGES_ITERATION_TITLE = "Request changes iteration";
/** Paths persisted on the latest Request-changes engineer pass. */
export const REQUEST_CHANGES_FILES_TITLE = "Request changes files updated";

export function isFollowUpGoal(goal: string | null | undefined): boolean {
  return Boolean(goal && goal.includes(CHANGES_I_WANT_MARKER.trim()));
}

export function isFollowUpImplementTitle(title: string): boolean {
  return (
    title === FOLLOW_UP_IMPLEMENT_TITLE ||
    title === FOLLOW_UP_UI_TITLE ||
    /^Apply requested changes\b/i.test(title) ||
    /^Apply UI refresh\b/i.test(title)
  );
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

/**
 * Accumulate Changes I want on the same chat — never drop prior open asks.
 * New requests are appended under "Next request:" so older bugs stay visible.
 */
export function mergeFollowUpChanges(existingGoal: string, newChanges: string): string {
  const { baseGoal, changes: prior } = parseFollowUpGoal(existingGoal);
  const next = newChanges.trim();
  if (!next) return baseGoal.trim() || existingGoal.trim();
  const priorTrim = prior.trim();
  const combined = priorTrim
    ? priorTrim.includes(next)
      ? priorTrim
      : `${priorTrim}\n\n---\nNext request:\n${next}`
    : next;
  return `${baseGoal.trim()}${CHANGES_I_WANT_MARKER}${combined}`;
}

export function changesAskForUi(changes: string): boolean {
  return /\b(overhaul|redesign|restyle|theme|visual|modern|ui\b|look and feel)\b/i.test(
    changes,
  );
}

export function changesAskForBugFix(changes: string): boolean {
  return /\b(bug|broken|fix|can'?t|cannot|doesn'?t|not working|error|crash|consume|inventory|shop|buy|move|drag|column)\b/i.test(
    changes,
  );
}

/** Split a change blob into bug-fix vs UI asks for separate engineer tasks. */
export function partitionIterateAsks(changes: string): {
  bugText: string;
  uiText: string;
  wantsSplit: boolean;
} {
  const lines = changes
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•–—]\s+/, "").trim())
    .filter(Boolean);
  const bugLines: string[] = [];
  const uiLines: string[] = [];
  const other: string[] = [];

  for (const line of lines) {
    if (/^---$/.test(line) || /^Next request:/i.test(line)) {
      const rest = line.replace(/^Next request:\s*/i, "").trim();
      if (!rest || /^---$/.test(line)) continue;
      // Fall through with rest as the line content
      const effective = rest;
      const isUi =
        changesAskForUi(effective) &&
        !/\b(bug|broken|fix|can'?t|consume|shop)\b/i.test(effective);
      const isBug = changesAskForBugFix(effective) && !isUi;
      if (isUi) uiLines.push(effective);
      else if (isBug) bugLines.push(effective);
      else other.push(effective);
      continue;
    }
    const isUi = changesAskForUi(line) && !/\b(bug|broken|fix|can'?t|consume|shop)\b/i.test(line);
    const isBug = changesAskForBugFix(line) && !isUi;
    if (isUi) uiLines.push(line);
    else if (isBug) bugLines.push(line);
    else other.push(line);
  }

  // Prose without newlines: split on "also"
  if (lines.length <= 1 && changesAskForUi(changes) && changesAskForBugFix(changes)) {
    const parts = changes.split(/\b(?:also[, ]+|and also\b)/i).map((p) => p.trim()).filter(Boolean);
    for (const p of parts) {
      if (changesAskForUi(p) && !changesAskForBugFix(p)) uiLines.push(p);
      else if (changesAskForBugFix(p)) bugLines.push(p);
      else other.push(p);
    }
  }

  const bugText = [...new Set([...bugLines, ...other.filter((o) => changesAskForBugFix(o))])].join(
    "\n",
  );
  const uiText = [...new Set(uiLines)].join("\n");
  const wantsSplit = Boolean(bugText.trim() && uiText.trim());
  return {
    bugText: bugText.trim() || (wantsSplit ? "" : changes.trim()),
    uiText: uiText.trim(),
    wantsSplit,
  };
}

/** Surgical patch prompt — Request changes must not invent a new product. */
export function followUpFixSystemPrompt(name: string, positionLabel: string): string {
  return `You are ${name}, ${positionLabel}, applying a Request-changes patch on an EXISTING shipped app.
This is NOT a brand-new product.

Rules:
- You receive CURRENT shipped files and a numbered "Changes I want" / must-fix list from the CEO.
- You MUST satisfy EVERY must-fix item so it works in Preview — not just the easy visual ones.
- Emit at least one complete \`\`\`file:path fence for every file you modify. Full file contents, not diffs.
- Do NOT finish with only prose / “done” / explanations and zero file fences — that ships nothing.
- Keep the same product name unless the CEO asked to rename it.
- Bug fixes: change the real JS/HTML behavior that is broken (e.g. shop consume, column move). Do not claim fixed without editing that logic.
- UI refresh: when the task is a UI refresh (or Changes I want includes overhaul/modern), update CSS/HTML so the look clearly changes. That is in scope for UI tasks.
- Do NOT break working flows (shop, inventory, quests, persistence) while editing. Preserve localStorage keys and existing feature entry points unless the must-fix list requires changing them.
- Static HTML/CSS/JS only. No Tailwind CDN, no type="module", no secrets.
- Prefer the smallest change that fully satisfies the must-fix list — but the list must be satisfied.`;
}

/** QA for same-chat Request changes — stricter than general Prefer-PASS. */
export function followUpQaSystemPrompt(name: string, positionLabel: string): string {
  return `You are ${name}, a ${positionLabel}, reviewing a Request-changes patch on an existing app.

Start your reply with exactly one of:
Verdict: FAIL
Verdict: PASS

Then confirm EACH must-fix / Changes I want item with one line (CEO-facing checklist):
- [MET] short label — quote file evidence (function/selector/CSS)
- [MISSING] short label — what is still absent in the shipped files

Rules:
- Every must-fix item gets exactly one [MET] or [MISSING] line. No skipping.
- Verdict PASS only if every item is [MET]. If any [MISSING], Verdict MUST be FAIL.
- FAIL if ANY must-fix bug is still broken in the shipped HTML/CSS/JS.
- FAIL if a requested UI overhaul/modern refresh has no meaningful CSS/HTML change.
- FAIL on regression: previously working primary controls (create/add, drag, connect, save, shop, etc.) no longer have real listeners / handlers in shipped JS.
- FAIL if app.js (or the main script) is a shell stub (e.g. only logs "UI shell ready") or looks truncated versus a feature-rich prior script.
- Do NOT PASS just because the old product still loads or HTML chrome still looks similar.
- Do NOT invent [MET] for theme “vibes” without evidence in the files.
- Prefer FAIL with honest [MISSING] lines over a false PASS — false PASS wastes the CEO.
- Do not rewrite the product yourself.`;
}

/** Auto-publish plan for Request-changes — skips council×3+synth LLM burn. */
export function surgicalFollowUpPlan(ceoGoal: string): string {
  const { baseGoal, changes } = parseFollowUpGoal(ceoGoal);
  const product = (baseGoal || "the existing product").slice(0, 400);
  const patch = (changes || "the requested change").slice(0, 1200);
  const wantsUi = changesAskForUi(patch);
  return `# Request changes (patch on current app)

## Goal
Preserve the existing product for: ${product}

Apply this change list from the CEO: ${patch}

## Recommended stack
Static HTML + CSS + JS with localStorage (same as the current shipped app).

## UX outline
${
  wantsUi
    ? "UI/visual refresh is requested — update styling and layout as needed while keeping the same product and core data."
    : "No gratuitous redesign. Preserve current screens and copy except where the change list requires edits."
}

## Features
- Apply every item in the CEO change list above (bugs and UI asks)
- Keep unrelated working behavior unless the change list conflicts with it

## Out of scope
New product, marketing landing templates, unrelated features not in the change list, full rewrite from a blank page.

## Task list
1. Engineer: Apply requested changes to current files (must emit changed file fences).
2. QA: Verify EACH requested change works; FAIL if unmet.

Hours, not days — patch the current static app until the change list is done.
`;
}
