/** Initial QA task title created in publishAndDelegate. */
export const INITIAL_QA_TITLE = "QA the delegated work";

/** Max engineer fix + re-QA cycles after the first FAIL (per batch). */
export const QA_MAX_REWORK_ROUNDS = 2;

/** Artifact written on Resume after QA exhaust — grants another batch of fix rounds. */
export const QA_REWORK_EXTENDED_TITLE = "QA rework extended";

/** QA-only pass after Resume — re-reads full shipped files before burning another engineer fix. */
export const QA_HONEST_RECHECK_TITLE = "QA honest recheck";

export type QaVerdict = "PASS" | "FAIL" | "UNKNOWN";

export type ParsedQaVerdict = {
  verdict: QaVerdict;
  punchList: string;
};

export function isQaReviewTitle(title: string): boolean {
  return (
    title === INITIAL_QA_TITLE ||
    title === QA_HONEST_RECHECK_TITLE ||
    /^QA recheck \(round \d+\)$/i.test(title)
  );
}

export function isQaFixTitle(title: string): boolean {
  return /^Fix QA punch list \(round \d+\)$/i.test(title);
}

export function qaFixTitle(round: number): string {
  return `Fix QA punch list (round ${round})`;
}

export function qaRecheckTitle(round: number): string {
  return `QA recheck (round ${round})`;
}

/**
 * Parse the leading Verdict line QA is prompted to emit.
 * Missing / malformed verdict → UNKNOWN (do not open a rework loop).
 */
export function parseQaVerdict(output: string | null | undefined): ParsedQaVerdict {
  if (!output?.trim()) {
    return { verdict: "UNKNOWN", punchList: "" };
  }
  const match = output.match(/^\s*Verdict:\s*(PASS|FAIL)\b/im);
  if (!match || match.index === undefined) {
    return { verdict: "UNKNOWN", punchList: output.trim() };
  }
  const verdict = match[1]!.toUpperCase() as "PASS" | "FAIL";
  const punchList = output.slice(match.index + match[0].length).trim();
  return { verdict, punchList };
}

/** How many fix rounds have already been opened for this run. */
export function countQaReworkRounds(
  tasks: Array<{ title: string }>,
): number {
  const rounds = new Set<number>();
  for (const t of tasks) {
    const match = t.title.match(/^Fix QA punch list \(round (\d+)\)$/i);
    if (match) rounds.add(Number(match[1]));
  }
  return rounds.size;
}

export function nextQaReworkRound(tasks: Array<{ title: string }>): number {
  let max = 0;
  for (const t of tasks) {
    const match = t.title.match(/^Fix QA punch list \(round (\d+)\)$/i);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

/** Base 2 rounds + extras granted when the CEO Resumes after QA exhaust. */
export function qaReworkRoundLimit(
  artifacts?: Array<{ title: string; content?: string | null }> | null,
): number {
  let extra = 0;
  for (const a of artifacts ?? []) {
    if (a.title !== QA_REWORK_EXTENDED_TITLE) continue;
    try {
      const parsed = JSON.parse(a.content ?? "{}") as { extraRounds?: number };
      extra +=
        typeof parsed.extraRounds === "number" && parsed.extraRounds > 0
          ? parsed.extraRounds
          : QA_MAX_REWORK_ROUNDS;
    } catch {
      extra += QA_MAX_REWORK_ROUNDS;
    }
  }
  return QA_MAX_REWORK_ROUNDS + extra;
}

export function isQaReworkExhaustedMessage(message: string | null | undefined): boolean {
  return Boolean(message && /QA still FAIL after \d+ fix rounds/i.test(message));
}

/**
 * Honest CEO copy: QA did not pass, but shipped files are not discarded.
 * Resume stays available (status remains failed) for more fix rounds.
 */
export function qaReworkExhaustedMessage(limit: number): string {
  return (
    `QA still FAIL after ${limit} fix rounds — your current app files are kept. ` +
    `Open Preview / ZIP anytime. Resume first re-checks QA with full files ` +
    `(may PASS without more engineering); if still FAIL, opens ${QA_MAX_REWORK_ROUNDS} more fix rounds ` +
    `(more API tokens), or start a new chat.`
  );
}

/** Resume extension asks for one QA-only re-audit before another engineer burn. */
export function hasPendingHonestQaRecheck(
  artifacts?: Array<{ title: string; content?: string | null }> | null,
): boolean {
  for (const a of artifacts ?? []) {
    if (a.title !== QA_REWORK_EXTENDED_TITLE) continue;
    try {
      const parsed = JSON.parse(a.content ?? "{}") as {
        honestRecheckPending?: boolean;
      };
      if (parsed.honestRecheckPending === true) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

export function markHonestQaRecheckConsumed(content: string | null | undefined): string {
  try {
    const parsed = JSON.parse(content ?? "{}") as Record<string, unknown>;
    return JSON.stringify({ ...parsed, honestRecheckPending: false });
  } catch {
    return JSON.stringify({ honestRecheckPending: false });
  }
}
