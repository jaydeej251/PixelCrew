export type EvalResult = {
  passed: boolean;
  score: number;
  reason: string;
};

export function evalStayInRole(output: string, position: string): EvalResult {
  const violations: Record<string, RegExp[]> = {
    project_manager: [/function\s+\w+\s*\(/, /import\s+.*from/, /CREATE TABLE/i],
    frontend_engineer: [/CREATE TABLE/i, /prisma\./i, /router\.(get|post)/i],
    backend_engineer: [/className=/, /<div/, /useState/],
    qa_engineer: [/function\s+main/, /export default function/],
  };

  const patterns = violations[position] ?? [];
  for (const p of patterns) {
    if (p.test(output)) {
      return { passed: false, score: 0.3, reason: `Output may be outside ${position} boundary` };
    }
  }
  return { passed: true, score: 1, reason: "Within role boundary" };
}

export function evalPrdQuality(output: string): EvalResult {
  const hasSections = ["goal", "user", "feature", "requirement"].some((s) =>
    output.toLowerCase().includes(s),
  );
  const lengthOk = output.length > 200;
  const score = (hasSections ? 0.5 : 0) + (lengthOk ? 0.5 : 0);
  return {
    passed: score >= 0.5,
    score,
    reason: hasSections && lengthOk ? "PRD has structure" : "PRD may be too thin",
  };
}
