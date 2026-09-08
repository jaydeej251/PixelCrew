import {
  parseFollowUpGoal,
  REQUEST_CHANGES_FILES_TITLE,
} from "./follow-up-goal";
import { productHintsFromGoal } from "./goal-fidelity";
import {
  isPackagerFallbackHtml,
  projectFilesFromArtifacts,
  type ArtifactLike,
} from "./project-files";

export type PromptSummary = {
  headline: string;
  body: string;
  isFollowUp: boolean;
  changes: string;
};

export type BuiltChecklistStatus = "met" | "missing" | "unclear";

export type BuiltChecklistItem = {
  id: string;
  /** CEO-facing requirement line (from the prompt). */
  label: string;
  status: BuiltChecklistStatus;
};

export type BuiltSummary = {
  headline: string;
  items: BuiltChecklistItem[];
  /** True when the checklist came from a QA confirmation artifact (not keyword guess). */
  confirmedByQa: boolean;
};

export type FilesUpdatedSummary = {
  paths: string[];
  empty: boolean;
  /** ISO timestamp from the latest Request-changes persist, if any. */
  at: string | null;
};

/** Artifact written when QA emits a per-ask MET/MISSING checklist. */
export const ASK_CONFIRMATION_TITLE = "Ask confirmation checklist";

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "from",
  "that",
  "this",
  "all",
  "any",
  "as",
  "at",
  "be",
  "by",
  "is",
  "are",
  "was",
  "were",
  "so",
  "if",
  "it",
  "its",
  "into",
  "over",
  "across",
  "using",
  "use",
  "used",
  "should",
  "must",
  "will",
  "can",
  "able",
  "each",
  "every",
  "your",
  "their",
  "them",
  "they",
  "have",
  "has",
  "had",
  "also",
  "via",
  "per",
  "etc",
  "complete",
  "custom",
  "styled",
  "theme",
  "ui",
  "css",
  "html",
  "js",
  "javascript",
  "tailwind",
]);

/** Short CEO-facing view of the run brief (full text stays available in the body). */
export function summarizePrompt(ceoGoal: string): PromptSummary {
  const { baseGoal, changes, isFollowUp } = parseFollowUpGoal(ceoGoal);
  const body = (baseGoal || ceoGoal).trim() || "—";
  const firstLine = body.split(/\n/).map((l) => l.trim()).find(Boolean) ?? body;
  const headline =
    firstLine.length > 120 ? `${firstLine.slice(0, 117).trimEnd()}…` : firstLine;
  return {
    headline,
    body,
    isFollowUp,
    changes: changes.trim(),
  };
}

/** Latest paths persisted by a Request-changes engineer pass (HUD). */
export function summarizeFilesUpdated(
  artifacts: ArtifactLike[],
): FilesUpdatedSummary {
  const hits = artifacts
    .filter((a) => a.title === REQUEST_CHANGES_FILES_TITLE)
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
  const latest = hits[hits.length - 1];
  if (!latest) {
    return { paths: [], empty: true, at: null };
  }
  try {
    const parsed = JSON.parse(latest.content) as {
      paths?: unknown;
      at?: string;
    };
    const paths = Array.isArray(parsed.paths)
      ? parsed.paths.filter((p): p is string => typeof p === "string")
      : [];
    return {
      paths,
      empty: paths.length === 0,
      at: typeof parsed.at === "string" ? parsed.at : null,
    };
  } catch {
    return { paths: [], empty: true, at: null };
  }
}

/**
 * Parse QA's per-ask confirmation lines:
 * - [MET] ...
 * - [MISSING] ...
 */
export function parseAskConfirmationChecklist(
  output: string | null | undefined,
): BuiltChecklistItem[] {
  if (!output?.trim()) return [];
  const items: BuiltChecklistItem[] = [];
  const seen = new Set<string>();
  const lineRe = /^\s*[-*]?\s*\[(MET|MISSING|FAIL|PASS|YES|NO)\]\s*(.+)$/gim;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(output)) !== null) {
    const raw = (m[1] ?? "").toUpperCase();
    const label = (m[2] ?? "").replace(/\s+/g, " ").trim();
    if (label.length < 4 || label.length > 160) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const status: BuiltChecklistStatus =
      raw === "MET" || raw === "PASS" || raw === "YES" ? "met" : "missing";
    items.push({ id: `qa-${items.length}`, label, status });
    if (items.length >= 12) break;
  }
  return items;
}

export function latestAskConfirmation(
  artifacts: ArtifactLike[],
): BuiltChecklistItem[] | null {
  const hits = artifacts
    .filter((a) => a.title === ASK_CONFIRMATION_TITLE)
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
  const latest = hits[hits.length - 1];
  if (!latest) return null;
  try {
    const parsed = JSON.parse(latest.content) as { items?: unknown };
    if (!Array.isArray(parsed.items)) return null;
    const items: BuiltChecklistItem[] = [];
    for (const row of parsed.items) {
      if (!row || typeof row !== "object") continue;
      const r = row as { label?: unknown; status?: unknown };
      if (typeof r.label !== "string" || r.label.trim().length < 4) continue;
      const status =
        r.status === "met" || r.status === "missing" ? r.status : "missing";
      items.push({
        id: `qa-${items.length}`,
        label: r.label.trim(),
        status,
      });
    }
    return items.length > 0 ? items : null;
  } catch {
    return null;
  }
}

function titleFromHtml(content: string): string | null {
  if (isPackagerFallbackHtml(content)) return null;
  const m = content.match(/<title[^>]*>\s*([^<]+?)\s*<\/title>/i);
  const t = m?.[1]?.replace(/\s+/g, " ").trim();
  return t && t.length > 0 && !/^no app to preview$/i.test(t) ? t : null;
}

function shippedCorpus(artifacts: ArtifactLike[]): {
  title: string | null;
  text: string;
  empty: boolean;
} {
  const filesMap = projectFilesFromArtifacts(artifacts);
  if (filesMap.size === 0) {
    return { title: null, text: "", empty: true };
  }
  let appTitle: string | null = null;
  const parts: string[] = [];
  for (const [path, content] of filesMap) {
    parts.push(path, content);
    if (!appTitle && /\.html?$/i.test(path)) {
      appTitle = titleFromHtml(content);
    }
  }
  return { title: appTitle, text: parts.join("\n").toLowerCase(), empty: false };
}

function cleanLabel(raw: string): string {
  return raw
    .replace(/^[-*•–—]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/^#+\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pull ask-facing requirement lines from the CEO goal (bullets, numbered, or
 * short feature sentences). Prefer follow-up "Changes I want" when present.
 */
export function extractAskItems(ceoGoal: string): string[] {
  const { baseGoal, changes, isFollowUp } = parseFollowUpGoal(ceoGoal);
  if (isFollowUp && changes.trim()) {
    return extractFollowUpChangeItems(changes).slice(0, 12);
  }

  const source = (baseGoal || ceoGoal).trim();
  if (!source) return [];

  const items: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const label = cleanLabel(raw);
    if (label.length < 8 || label.length > 160) return;
    if (/^(core mechanics|features|requirements|aesthetics|overview|goal)\b/i.test(label)) {
      return;
    }
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push(label);
  };

  for (const line of source.split(/\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (/^[-*•–—]\s+\S/.test(t) || /^\d+[.)]\s+\S/.test(t)) {
      const colonIdx = t.indexOf(":");
      const afterColon = colonIdx >= 0 ? t.slice(colonIdx + 1).trim() : "";
      if (afterColon && afterColon.length >= 12) {
        const head = cleanLabel(t.slice(0, colonIdx));
        push(head.length >= 8 ? `${head}: ${afterColon}` : afterColon);
      } else {
        push(t);
      }
      continue;
    }
    const bold = t.match(/^\*\*([^*]{4,80})\*\*:?\s*(.*)$/);
    if (bold) {
      const rest = (bold[2] ?? "").trim();
      push(rest ? `${bold[1]}: ${rest}` : bold[1]!);
    }
  }

  if (items.length === 0) {
    for (const chunk of source.split(/(?:;|\n|(?<=\.)\s+(?=[A-Z]))/)) {
      const t = cleanLabel(chunk);
      if (t.length >= 20 && t.length <= 140) push(t);
      if (items.length >= 8) break;
    }
  }

  for (const hint of productHintsFromGoal(source).slice(0, 1)) {
    const label = `Product named “${hint}”`;
    if (!seen.has(label.toLowerCase())) {
      items.unshift(label);
    }
  }

  return items.slice(0, 12);
}

/** Turn free-form Request-changes prose into short checklist asks. */
export function extractFollowUpChangeItems(changes: string): string[] {
  const raw = changes.trim();
  if (!raw) return [];

  const chunks = raw
    .split(/\n+/)
    .flatMap((line) => line.split(/\b(?:also[, ]+|and also\b)/i))
    .map((c) => cleanLabel(c))
    .filter(Boolean);

  const items: string[] = [];
  const seen = new Set<string>();
  const push = (label: string) => {
    const t = label.replace(/\s+/g, " ").trim();
    if (t.length < 6 || t.length > 120) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push(t);
  };

  for (const chunk of chunks) {
    let text = chunk;
    if (/^---$/.test(text)) continue;
    if (/^Next request:/i.test(text)) {
      text = text.replace(/^Next request:\s*/i, "").trim();
      if (!text) continue;
    }
    // Normalize common bug/UI asks into readable checklist lines.
    if (/\b(move|drag|drop|backlog|column|kanban|status)\b/i.test(text)) {
      push("Move / advance tasks across columns (e.g. backlog → in quest → completed)");
      continue;
    }
    if (/\b(overhaul|redesign|restyle|theme|ui)\b/i.test(text)) {
      push("UI overhaul / visual refresh");
      continue;
    }
    if (/\bbug\b|\bbroken\b|\bcan'?t\b|\bcannot\b|\bfix\b/i.test(text)) {
      const short =
        text.length > 100 ? `${text.slice(0, 97).trimEnd()}…` : text;
      push(short);
      continue;
    }
    if (text.length <= 120) push(text);
    else {
      // Long prose: take first sentence-ish clause
      const first = text.split(/(?<=[.!?])\s+/)[0] ?? text;
      push(first.length > 120 ? `${first.slice(0, 117).trimEnd()}…` : first);
    }
  }

  if (items.length === 0) {
    push(raw.length > 100 ? `${raw.slice(0, 97).trimEnd()}…` : raw);
  }
  return items.slice(0, 8);
}

function significantTokens(label: string): string[] {
  const words = label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
  const uniq = [...new Set(words)].sort((a, b) => b.length - a.length);
  return uniq.slice(0, 5);
}

function scoreItemInCorpus(
  label: string,
  corpus: string,
  opts?: { followUp?: boolean; filesUpdated?: FilesUpdatedSummary },
): BuiltChecklistStatus {
  const lower = label.toLowerCase();
  const followUp = opts?.followUp === true;
  const filesUpdated = opts?.filesUpdated;

  // Follow-up: require stronger evidence — old apps already contain "quest"/"task".
  if (followUp) {
    if (/move|advance tasks|column|backlog|drag|drop/i.test(label)) {
      if (/(ondrag|dragstart|dragover|drop\b|dataTransfer|sortable)/i.test(corpus)) {
        return "met";
      }
      return "missing";
    }
    if (/ui overhaul|visual refresh|redesign|theme|modern/i.test(label)) {
      // Never auto-✓ from CSS “vibes”. Unconfirmed = not done for the CEO.
      const touchedVisual = (filesUpdated?.paths ?? []).some((p) =>
        /\.(css|html?)$/i.test(p),
      );
      if (!touchedVisual) return "missing";
      // Touched CSS/HTML but we cannot prove “modern” without QA confirmation.
      return "missing";
    }
    const tokens = significantTokens(label).filter(
      (t) => !["quest", "task", "tasks", "game", "app"].includes(t),
    );
    if (tokens.length === 0) return "missing";
    const hits = tokens.filter((t) => corpus.includes(t)).length;
    // Client-facing: only ✓ when evidence is strong. Partial hits = not confirmed.
    if (hits >= Math.min(2, tokens.length)) return "met";
    return "missing";
  }

  const phrase = lower.replace(/^product named\s+[“"]?/, "").replace(/[”"].*$/, "").trim();
  if (phrase.length >= 6 && corpus.includes(phrase.slice(0, Math.min(40, phrase.length)))) {
    return "met";
  }

  if (/\blocalstorage\b/i.test(label) || /\bpersist/i.test(label)) {
    return /localstorage/.test(corpus) ? "met" : "missing";
  }
  if (/\binventory\b/i.test(label)) {
    return /inventory/.test(corpus) ? "met" : "missing";
  }
  if (/\bquest\b/i.test(label)) {
    return /quest/.test(corpus) ? "met" : "missing";
  }
  if (/\b(pixel|fantasy|retro|rpg)\b/i.test(label)) {
    return /(pixel|fantasy|retro|rpg|quest)/.test(corpus) ? "met" : "unclear";
  }

  const tokens = significantTokens(label);
  if (tokens.length === 0) return "unclear";
  const hits = tokens.filter((t) => corpus.includes(t)).length;
  if (hits >= Math.min(2, tokens.length) || (tokens.length === 1 && hits === 1)) {
    return "met";
  }
  if (hits === 0) return "missing";
  return "unclear";
}

/**
 * Checklist of what was asked vs evidence in shipped files (no file dump).
 * Prefers QA's MET/MISSING confirmation when present — that is the client source of truth.
 */
export function summarizeBuilt(
  artifacts: ArtifactLike[],
  ceoGoal: string,
): BuiltSummary {
  const { title, text, empty } = shippedCorpus(artifacts);
  const { isFollowUp } = parseFollowUpGoal(ceoGoal);
  const asks = extractAskItems(ceoGoal);
  const filesUpdated = summarizeFilesUpdated(artifacts);
  const qaConfirmed = latestAskConfirmation(artifacts);

  if (empty) {
    return {
      headline: "Nothing shipped yet",
      confirmedByQa: false,
      items: asks.map((label, i) => ({
        id: `ask-${i}`,
        label,
        status: "missing" as const,
      })),
    };
  }

  if (qaConfirmed && qaConfirmed.length > 0) {
    return {
      headline: isFollowUp
        ? title
          ? `${title} — your changes`
          : "Your requested changes"
        : (title ?? "Checklist vs your prompt"),
      confirmedByQa: true,
      items: qaConfirmed,
    };
  }

  const items: BuiltChecklistItem[] = asks.map((label, i) => ({
    id: `ask-${i}`,
    label,
    status: scoreItemInCorpus(label, text, {
      followUp: isFollowUp,
      filesUpdated: isFollowUp ? filesUpdated : undefined,
    }),
  }));

  if (items.length === 0) {
    const hints = productHintsFromGoal(ceoGoal);
    if (hints[0]) {
      items.push({
        id: "product",
        label: `Product named “${hints[0]}”`,
        status: text.includes(hints[0].toLowerCase()) ? "met" : "missing",
      });
    }
    items.push({
      id: "app",
      label: "A previewable app was produced",
      status: "met",
    });
  }

  return {
    headline: isFollowUp
      ? title
        ? `${title} — your changes`
        : "Your requested changes"
      : (title ?? "Checklist vs your prompt"),
    confirmedByQa: false,
    items,
  };
}
