import { slugify } from "./utils";

export type PlanDecisionOption = {
  id: string;
  label: string;
  recommended?: boolean;
};

export type PlanDecision = {
  id: string;
  prompt: string;
  why: string;
  options: PlanDecisionOption[];
  selectedId?: string | null;
};

export type PlanDecisionsState = {
  items: PlanDecision[];
  appliedKey?: string;
};

export const MAX_PLAN_DECISIONS = 3;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;

/** Internal execution choices the CEO should not be quizzed on. */
const NOT_DIRECTIONAL =
  /\b(stack|localStorage|react|next\.?js|mongodb|heroku|recaptcha|timeline|gantt|who (builds|codes|implements)|html\s*\+?\s*css|inline js|addEventListener)\b/i;

export function allDecisionsAnswered(items: PlanDecision[]): boolean {
  return items.length === 0 || items.every((d) => Boolean(d.selectedId));
}

export function unansweredDecisionCount(items: PlanDecision[]): number {
  return items.filter((d) => !d.selectedId).length;
}

export function decisionAnswersKey(items: PlanDecision[]): string {
  return items
    .map((d) => `${d.id}=${d.selectedId ?? ""}`)
    .sort()
    .join("|");
}

export function recommendedOption(decision: PlanDecision): PlanDecisionOption | undefined {
  return decision.options.find((o) => o.recommended) ?? decision.options[0];
}

export function withRecommendedAnswers(items: PlanDecision[]): PlanDecision[] {
  return items.map((d) => ({
    ...d,
    selectedId: d.selectedId || recommendedOption(d)?.id || null,
  }));
}

export function picksDifferFromRecommended(items: PlanDecision[]): boolean {
  return items.some((d) => {
    const rec = recommendedOption(d);
    return Boolean(d.selectedId) && rec && d.selectedId !== rec.id;
  });
}

export function formatCeoDecisions(items: PlanDecision[]): string {
  return items
    .map((d) => {
      const opt = d.options.find((o) => o.id === d.selectedId);
      const rec = recommendedOption(d);
      const mark = opt?.id === rec?.id ? " (recommended default)" : "";
      return `- ${d.prompt} → ${opt?.label ?? d.selectedId}${mark}`;
    })
    .join("\n");
}

export function optionDisplayLabel(option: PlanDecisionOption): string {
  if (option.recommended && !/\brecommended\b/i.test(option.label)) {
    return `${option.label} (Recommended)`;
  }
  return option.label;
}

export function parseDecisionsState(raw: string): PlanDecisionsState {
  try {
    const parsed = JSON.parse(raw) as PlanDecisionsState;
    if (!parsed || !Array.isArray(parsed.items)) return { items: [] };
    return {
      items: sanitizeDecisions(parsed.items, { keepSelected: true }),
      appliedKey: typeof parsed.appliedKey === "string" ? parsed.appliedKey : undefined,
    };
  } catch {
    return { items: [] };
  }
}

export function stripDecisionFence(text: string): string {
  let rest = text;
  for (const fence of jsonFences(text)) {
    if (hasDecisionsKey(fence.body)) {
      rest = rest.replace(fence.full, "");
    }
  }
  return rest.replace(/\n{3,}/g, "\n\n").trim();
}

export function parsePlanDecisions(text: string): PlanDecision[] {
  for (const fence of jsonFences(text)) {
    const parsed = tryParse(fence.body);
    if (!parsed || !Array.isArray(parsed.decisions)) continue;
    return sanitizeDecisions(parsed.decisions);
  }
  return [];
}

function jsonFences(text: string): Array<{ full: string; body: string }> {
  const out: Array<{ full: string; body: string }> = [];
  const re = /```json\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    out.push({ full: match[0], body: match[1] ?? "" });
  }
  return out;
}

function hasDecisionsKey(body: string): boolean {
  const parsed = tryParse(body);
  return Boolean(parsed && Array.isArray(parsed.decisions));
}

function tryParse(body: string): { decisions?: unknown } | null {
  try {
    return JSON.parse(body) as { decisions?: unknown };
  } catch {
    const loose = body.match(/\{[\s\S]*"decisions"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
    if (!loose) return null;
    try {
      return JSON.parse(loose[0]) as { decisions?: unknown };
    } catch {
      return null;
    }
  }
}

function sanitizeDecisions(
  raw: unknown[],
  opts: { keepSelected?: boolean } = {},
): PlanDecision[] {
  const seen = new Set<string>();
  const items: PlanDecision[] = [];
  for (const entry of raw) {
    if (items.length >= MAX_PLAN_DECISIONS) break;
    const decision = sanitizeOne(entry, seen, opts.keepSelected);
    if (decision) items.push(decision);
  }
  return items;
}

function sanitizeOne(
  raw: unknown,
  seen: Set<string>,
  keepSelected?: boolean,
): PlanDecision | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const prompt = String(row.prompt ?? row.question ?? "").trim();
  if (prompt.length < 8 || NOT_DIRECTIONAL.test(prompt)) return null;

  const options = sanitizeOptions(row.options);
  if (options.length < MIN_OPTIONS) return null;

  let id = slugify(String(row.id ?? prompt)).slice(0, 48);
  if (!id) id = `decision-${seen.size + 1}`;
  if (seen.has(id)) id = `${id}-${seen.size + 1}`;
  seen.add(id);

  const why = String(row.why ?? row.reason ?? "").trim().slice(0, 240);
  const selectedRaw = keepSelected ? String(row.selectedId ?? "") : "";
  const selectedId = options.some((o) => o.id === selectedRaw) ? selectedRaw : null;

  return { id, prompt: prompt.slice(0, 160), why, options, selectedId };
}

function sanitizeOptions(raw: unknown): PlanDecisionOption[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const options: PlanDecisionOption[] = [];
  for (const entry of raw) {
    if (options.length >= MAX_OPTIONS) break;
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    let label = String(row.label ?? row.text ?? "").trim();
    if (label.length < 2) continue;
    const flagged = Boolean(row.recommended) || /\brecommended\b/i.test(label);
    label = label.replace(/\s*\(recommended\)\s*$/i, "").trim();
    let id = slugify(String(row.id ?? label)).slice(0, 48);
    if (!id) continue;
    if (seen.has(id)) id = `${id}-${seen.size + 1}`;
    seen.add(id);
    options.push({ id, label: label.slice(0, 80), recommended: flagged });
  }
  if (options.length < MIN_OPTIONS) return [];
  if (!options.some((o) => o.recommended)) options[0]!.recommended = true;
  let recSeen = false;
  return options.map((o) => {
    if (!o.recommended) return o;
    if (recSeen) return { ...o, recommended: false };
    recSeen = true;
    return o;
  });
}

export function applyAnswer(
  items: PlanDecision[],
  decisionId: string,
  optionId: string,
): PlanDecision[] | null {
  const target = items.find((d) => d.id === decisionId);
  if (!target?.options.some((o) => o.id === optionId)) return null;
  return items.map((d) => (d.id === decisionId ? { ...d, selectedId: optionId } : d));
}

export function decisionApplyUserPrompt(plan: string, items: PlanDecision[]): string {
  return `Current plan:
${plan}

The CEO picked these directional answers:
${formatCeoDecisions(items)}

Rewrite the combined plan so it matches. Keep Goal, stack, UX, features, out of scope, and the task list. Do not add a decisions json fence. Put the full plan under "Updated plan".`;
}
