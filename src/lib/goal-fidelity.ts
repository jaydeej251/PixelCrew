const PLATFORM_BRAND = /\bPixelCrew\b/i;

const GENERIC_HINTS = new Set([
  "HTML",
  "CSS",
  "JSON",
  "API",
  "CEO",
  "SPA",
  "UI",
  "UX",
  "JS",
  "MERN",
]);

/** Pull likely product names from a CEO goal for plan and ship fidelity checks. */
export function productHintsFromGoal(goal: string): string[] {
  const hints = new Set<string>();
  const push = (raw: string) => {
    const name = raw.replace(/\s+/g, " ").trim();
    if (name.length < 3 || name.length > 48) return;
    if (GENERIC_HINTS.has(name.toUpperCase())) return;
    if (PLATFORM_BRAND.test(name)) return;
    hints.add(name);
  };

  for (const match of goal.matchAll(
    /["“]([A-Z][A-Za-z0-9]{2,}(?:\s+[A-Za-z0-9][A-Za-z0-9-]*){0,3})["”]/g,
  )) {
    push(match[1]!.split(/[—–-]/)[0]!.trim());
  }
  for (const match of goal.matchAll(
    /\*\*["“]?([A-Z][A-Za-z0-9]{2,}(?:\s*[—–-]\s*[^"*]*)?)/g,
  )) {
    push(match[1]!.split(/[—–-]/)[0]!.trim());
  }
  for (const match of goal.matchAll(
    /\b([A-Z][a-z]+(?:Board|App|Tracker|Dash|Hub|Kit|Lab|Cast|Flow|Base|Desk|Pad|Pulse|Ledger))\b/g,
  )) {
    push(match[1]!);
  }
  for (const match of goal.matchAll(/\b([A-Z][a-z]+[A-Z][A-Za-z0-9]+)\b/g)) {
    push(match[1]!);
  }

  return [...hints];
}

/** Explicit negative requirements are acceptance criteria, not optional guidance. */
export function explicitlyForbiddenGoalTerms(goal: string): string[] {
  const candidates = [
    "portfolio",
    "marketing landing page",
    "landing page",
    "contact",
    "privacy",
    "legal",
    "social footer",
    "footer",
    "emoji",
    "purple gradient",
  ];

  return candidates.filter((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `(?:do\\s+not|don't|never|no|without|avoid)\\b[^.\\n]{0,80}\\b${escaped}s?\\b`,
      "i",
    ).test(goal);
  });
}

export function missingProductHints(content: string, goal: string): string[] {
  const hints = productHintsFromGoal(goal);
  if (hints.length === 0) return [];
  const lower = content.toLowerCase();
  return hints.some((hint) => lower.includes(hint.toLowerCase())) ? [] : hints;
}

export function violatedForbiddenTerms(content: string, goal: string): string[] {
  const hasPositiveMention = (pattern: RegExp) => {
    for (const match of content.matchAll(new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`))) {
      const index = match.index ?? 0;
      const lineStart = content.lastIndexOf("\n", index) + 1;
      const before = content.slice(lineStart, index);
      if (/(?:do\s+not|don't|never|no|without|avoid)\b[^.]{0,80}$/i.test(before)) {
        continue;
      }
      return true;
    }
    return false;
  };

  return explicitlyForbiddenGoalTerms(goal).filter((term) => {
    if (term === "contact") {
      return hasPositiveMention(/\bcontact(?:\s+us|\s+form|\s+section)?\b/i);
    }
    if (term === "privacy") {
      return hasPositiveMention(/\bprivacy(?:\s+policy)?\b/i);
    }
    if (term === "footer") return hasPositiveMention(/<footer\b|\bfooter\b/i);
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return hasPositiveMention(new RegExp(`\\b${escaped}\\b`, "i"));
  });
}
