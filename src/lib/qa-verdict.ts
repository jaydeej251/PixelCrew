/** Initial QA task title created in publishAndDelegate. */
export const INITIAL_QA_TITLE = "QA the delegated work";

/** Max engineer fix + re-QA cycles after the first FAIL. */
export const QA_MAX_REWORK_ROUNDS = 2;

export type QaVerdict = "PASS" | "FAIL" | "UNKNOWN";

export type ParsedQaVerdict = {
  verdict: QaVerdict;
  punchList: string;
};

export function isQaReviewTitle(title: string): boolean {
  return (
    title === INITIAL_QA_TITLE || /^QA recheck \(round \d+\)$/i.test(title)
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
