/**
 * Continue in a new chat while keeping the shipped app (fresh token budget).
 * Used when a chat hits the hard token gate or the CEO wants to keep iterating
 * without a redesign.
 */

import { CHANGES_I_WANT_MARKER } from "./follow-up-goal";
import { isProjectPath, normalizePath } from "./project-files";
import { isQaReviewTitle, parseQaVerdict } from "./qa-verdict";

export const CARRY_FORWARD_SUMMARY_TITLE = "Carry-forward summary";
export const CONTINUE_CARRY_HINT =
  "Preserve every copied file. Do NOT rebuild from scratch or redesign chrome/theme unless asked below.";

export type CarryArtifactLike = {
  type?: string;
  title?: string;
  content?: string | null;
  filePath?: string | null;
};

export type CarryTaskLike = {
  title: string;
  output?: string | null;
  status?: string;
};

/** File paths that will be copied into the new chat. */
export function listShippedCodePaths(artifacts: CarryArtifactLike[]): string[] {
  const paths = new Set<string>();
  for (const a of artifacts) {
    if (a.type && a.type !== "code") continue;
    if (!isProjectPath(a.filePath)) continue;
    const n = normalizePath(a.filePath!);
    if (n) paths.add(n);
  }
  return [...paths].sort();
}

/** Compact status for the new chat brief — keeps punch lists, not the whole transcript. */
export function buildCarryForwardSummary(opts: {
  artifacts: CarryArtifactLike[];
  tasks?: CarryTaskLike[];
  runError?: string | null;
  maxChars?: number;
}): string {
  const maxChars = opts.maxChars ?? 2_400;
  const files = listShippedCodePaths(opts.artifacts);
  const lines: string[] = [];

  if (files.length > 0) {
    lines.push(`Shipped files (${files.length}): ${files.join(", ")}`);
  } else {
    lines.push("Shipped files: none found — cannot safely continue without a redesign.");
  }

  const err = opts.runError?.trim();
  if (err) {
    lines.push(`Prior chat stop: ${err.slice(0, 400)}`);
  }

  const qaTasks = [...(opts.tasks ?? [])]
    .filter((t) => isQaReviewTitle(t.title) && t.output?.trim())
    .reverse();
  const latestQa = qaTasks[0];
  if (latestQa?.output) {
    const { verdict, punchList } = parseQaVerdict(latestQa.output);
    lines.push(`Latest QA: ${verdict}`);
    if (punchList) {
      lines.push(`Open punch list:\n${punchList.slice(0, 1_200)}`);
    }
  }

  let text = lines.join("\n\n").trim();
  if (text.length > maxChars) text = `${text.slice(0, maxChars - 1)}…`;
  return text;
}

/** Prefill for the continue sheet when the prior chat hit a limit / QA exhaust. */
export function defaultContinueChangesDraft(opts: {
  runError?: string | null;
  artifacts: CarryArtifactLike[];
  tasks?: CarryTaskLike[];
}): string {
  const punch = (() => {
    const qa = [...(opts.tasks ?? [])]
      .filter((t) => isQaReviewTitle(t.title) && t.output?.trim())
      .reverse()[0];
    if (!qa?.output) return "";
    const { verdict, punchList } = parseQaVerdict(qa.output);
    if (verdict !== "FAIL" || !punchList.trim()) return "";
    return punchList.trim().slice(0, 800);
  })();

  if (punch) {
    return (
      `Finish the remaining QA punch items below. Keep the current app working — do not redesign.\n\n` +
      `${punch}`
    );
  }

  if (/token|256|spend limit/i.test(opts.runError ?? "")) {
    return (
      `Continue from the carried files. Fix whatever is still broken in Preview ` +
      `(especially dead buttons / missing listeners). Do not redesign the UI.`
    );
  }

  return `Continue improving the carried app. Fix remaining Preview bugs only — do not redesign.`;
}

/**
 * Goal text for a new chat that carries the prior app.
 * Keeps CHANGES_I_WANT_MARKER so orchestrator takes the surgical follow-up path.
 */
export function buildContinueCarryGoal(opts: {
  baseGoal: string;
  changes: string;
  summary?: string;
}): string {
  const base = opts.baseGoal.trim();
  const changes = opts.changes.trim();
  // Keep summary short in the goal — full status lives on the Carry-forward summary artifact.
  // Dumping multi-kB status into ceoGoal made every Eng/QA turn re-pay those tokens.
  const summary = opts.summary?.trim().slice(0, 500);
  const changeBody = [
    CONTINUE_CARRY_HINT,
    summary ? `Status from prior chat:\n${summary}` : "",
    `Requested now:\n${changes}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return `${base}${CHANGES_I_WANT_MARKER}${changeBody}`;
}

/** Rows to insert when seeding a continue chat from a parent run. */
export function seedCarryForwardArtifacts(opts: {
  parentRunId: string;
  priorCode: Array<{
    type: string;
    title: string;
    content: string;
    filePath: string | null;
  }>;
  summary: string;
}): Array<{
  type: string;
  title: string;
  content: string;
  filePath?: string | null;
}> {
  const code = opts.priorCode.map((a) => ({
    type: a.type,
    title: a.title,
    content: a.content,
    filePath: a.filePath,
  }));
  return [
    ...code,
    {
      type: "other",
      title: CARRY_FORWARD_SUMMARY_TITLE,
      content: opts.summary,
      filePath: null,
    },
  ];
}
