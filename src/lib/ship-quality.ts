import {
  missingProductHints,
  violatedForbiddenTerms,
} from "./goal-fidelity";

export type ProjectFile = {
  path: string;
  content: string;
};

export type ShipIssue = {
  severity: "fail" | "warn";
  message: string;
};

export type ShipReport = {
  passed: boolean;
  issues: ShipIssue[];
};

const PLACEHOLDER_COPY = [
  /\bjohn doe\b/i,
  /\bjane doe\b/i,
  /\bproject one\b/i,
  /\bproject two\b/i,
  /\blorem ipsum\b/i,
  /description of the project with key features/i,
  /lorem ipsum dolor/i,
];

const SECRETISH = [
  /your-email-password/i,
  /your-recaptcha-secret/i,
  /pass:\s*['"][^'"]+['"]/,
];

function fileMap(files: ProjectFile[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of files) {
    const path = file.path.replace(/^\.\//, "");
    map.set(path, file.content);
    const base = path.split("/").pop();
    if (base) map.set(base, file.content);
  }
  return map;
}

function htmlFiles(files: ProjectFile[]): ProjectFile[] {
  return files.filter((f) => /\.html?$/i.test(f.path));
}

function localAssetRefs(html: string): string[] {
  const refs: string[] = [];
  const re =
    /(?:src|href)\s*=\s*["'](?!https?:|data:|mailto:|tel:|#|javascript:)([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = (match[1] ?? "").trim();
    if (!raw || raw.startsWith("/") || raw.includes("://")) continue;
    refs.push(raw.split("?")[0] ?? raw);
  }
  return refs;
}

function rootAbsoluteAssetRefs(html: string): string[] {
  const refs: string[] = [];
  const re = /(?:src|href)\s*=\s*["'](\/(?!\/)[^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = (match[1] ?? "").trim();
    if (raw) refs.push(raw);
  }
  return refs;
}

const CDN_HOST =
  /https?:\/\/(?:[^/"']+\.)?(?:unpkg\.com|jsdelivr\.net|cdnjs\.cloudflare\.com|cdn\.tailwindcss\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\b/i;

function hasRealContent(html: string): boolean {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 80;
}

function combinedScripts(files: ProjectFile[]): string {
  const fromFiles = files
    .filter((f) => /\.m?js$/i.test(f.path))
    .map((f) => f.content)
    .join("\n");
  const fromHtml = files
    .filter((f) => /\.html?$/i.test(f.path))
    .flatMap((f) =>
      [...f.content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(
        (m) => m[1] ?? "",
      ),
    )
    .join("\n");
  return `${fromFiles}\n${fromHtml}`;
}

function hasContactForm(html: string): boolean {
  const forms = html.match(/<form\b[\s\S]*?<\/form>/gi) ?? [];
  return forms.some((form) =>
    /contact|type\s*=\s*["']email["']|name\s*=\s*["'](email|message)["']/i.test(form),
  );
}

function persistsCollection(js: string): boolean {
  const reads = /localStorage\.getItem/.test(js) && /JSON\.parse/.test(js);
  const appends = /\.push\s*\(|\[\s*\.\.\.|concat\s*\(/.test(js);
  const writes = /localStorage\.setItem/.test(js);
  return reads && appends && writes;
}

function hidesFormOnSubmit(js: string): boolean {
  return (
    /(?:contactForm|getElementById\(\s*['"][^'"]*form[^'"]*['"]\s*\))[\s\S]{0,160}?style\.display\s*=\s*['"]none['"]/i.test(
      js,
    )
  );
}

type Anchor = { href: string; target: string; rel: string };

function htmlAnchors(html: string): Anchor[] {
  const tags = html.match(/<a\b[^>]*>/gi) ?? [];
  return tags.map((tag) => ({
    href: tag.match(/href\s*=\s*["']([^"']*)["']/i)?.[1] ?? "",
    target: tag.match(/target\s*=\s*["']([^"']*)["']/i)?.[1] ?? "",
    rel: tag.match(/rel\s*=\s*["']([^"']*)["']/i)?.[1] ?? "",
  }));
}

const SOCIAL_HOST =
  /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com|github\.com|linkedin\.com|instagram\.com|facebook\.com)\b/i;

const PLATFORM_BRAND = /\bPixelCrew\b/i;

/** Old engineer / template portfolio demos — not a real CEO product unless named in the goal. */
const KNOWN_STUB_PROJECTS = ["ColorVision", "NeuralArt"] as const;

export { productHintsFromGoal } from "./goal-fidelity";

function brandsAsPlatform(html: string): boolean {
  return (
    /<title[^>]*>[^<]*PixelCrew[^<]*<\/title>/i.test(html) ||
    /<h1[^>]*>[^<]*PixelCrew[^<]*<\/h1>/i.test(html) ||
    /Welcome to PixelCrew/i.test(html) ||
    /PixelCrew\s+Projects/i.test(html)
  );
}

function hasKnownStubProjects(html: string, ceoGoal: string): boolean {
  const hits = KNOWN_STUB_PROJECTS.filter((name) =>
    new RegExp(`\\b${name}\\b`, "i").test(html),
  );
  if (hits.length < 2) return false;
  return !hits.some((name) => new RegExp(`\\b${name}\\b`, "i").test(ceoGoal));
}

/**
 * True when HTML is the PixelCrew / ColorVision+NeuralArt marketing portfolio
 * and the CEO goal is a different product. Preview/export must not serve this.
 */
export function isMismatchedMarketingHtml(content: string, ceoGoal: string): boolean {
  const goal = ceoGoal.trim();
  if (!content.trim()) return false;
  if (PLATFORM_BRAND.test(goal)) return false;
  if (brandsAsPlatform(content)) return true;
  if (hasKnownStubProjects(content, goal)) return true;
  return false;
}

export function formatShipReport(report: ShipReport): string {
  if (report.issues.length === 0) return "Automated ship check: PASS (no issues found).";
  const lines = report.issues.map(
    (i) => `- [${i.severity.toUpperCase()}] ${i.message}`,
  );
  return `Automated ship check: ${report.passed ? "WARN" : "FAIL"}\n${lines.join("\n")}`;
}

/** Inspect emitted project files the way a preview user would. */
export function evalShippedProject(
  files: ProjectFile[],
  opts: { role?: string; ceoGoal?: string } = {},
): ShipReport {
  const issues: ShipIssue[] = [];
  const role = opts.role ?? "";
  const ceoGoal = opts.ceoGoal ?? "";
  const backendOnly = role === "backend_engineer";
  const map = fileMap(files);
  const html = htmlFiles(files);
  const htmlBlob = html.map((p) => p.content).join("\n");

  if (!backendOnly && html.length === 0) {
    issues.push({
      severity: "fail",
      message: "No index.html (or other HTML) was emitted — preview will be empty.",
    });
  }

  if (!backendOnly && html.length > 0 && ceoGoal.trim()) {
    if (isMismatchedMarketingHtml(htmlBlob, ceoGoal)) {
      issues.push({
        severity: "fail",
        message:
          "HTML looks like a PixelCrew / ColorVision / NeuralArt marketing portfolio, but that is not the CEO product. Rebuild around the goal name and features (e.g. PulseBoard) — force a full rewrite.",
      });
    }

    const blob = `${htmlBlob}\n${files.map((f) => f.content).join("\n")}`;
    const missingHints = missingProductHints(blob, ceoGoal);
    if (missingHints.length > 0) {
      issues.push({
        severity: "fail",
        message: `Shipped UI never mentions the CEO product (${missingHints.slice(0, 3).join(", ")}). Rebuild the demo around that goal — do not invent an unrelated portfolio.`,
      });
    }

    const forbidden = violatedForbiddenTerms(htmlBlob, ceoGoal);
    if (forbidden.length > 0) {
      issues.push({
        severity: "fail",
        message: `Shipped UI violates explicit CEO bans (${forbidden.join(", ")}). Remove unrequested template sections and follow the goal literally.`,
      });
    }
  }

  for (const page of html) {
    const content = page.content;
    for (const pattern of PLACEHOLDER_COPY) {
      if (pattern.test(content)) {
        issues.push({
          severity: "fail",
          message: `${page.path} still has placeholder copy (${pattern.source}). Invent specific content from the CEO goal.`,
        });
      }
    }
    if (!hasRealContent(content)) {
      issues.push({
        severity: "fail",
        message: `${page.path} has almost no visible content.`,
      });
    }

    for (const ref of rootAbsoluteAssetRefs(content)) {
      issues.push({
        severity: "fail",
        message: `${page.path} uses root-absolute asset path "${ref}". Use relative paths (e.g. styles.css, ./app.js) so preview and zip work.`,
      });
    }

    const cdnRefs = [...content.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']/gi)]
      .map((m) => m[1] ?? "")
      .filter((url) => CDN_HOST.test(url));
    for (const url of cdnRefs) {
      issues.push({
        severity: "fail",
        message: `${page.path} loads external CDN asset "${url}". Emit all CSS/JS/fonts inline or as local files — preview CSP blocks CDNs.`,
      });
    }

    if (/<script\b[^>]*\btype\s*=\s*["']module["']/i.test(content)) {
      issues.push({
        severity: "fail",
        message: `${page.path} uses type="module". Launch A static apps must use classic <script src="..."> without ES module imports.`,
      });
    }

    const missingImgs = localAssetRefs(content).filter((ref) => {
      if (ref.endsWith(".css") || ref.endsWith(".js") || ref.endsWith(".mjs")) {
        return !map.has(ref) && !map.has(ref.replace(/^\.\//, ""));
      }
      if (!/\.(png|jpe?g|gif|webp|svg|ico|pdf)$/i.test(ref)) return false;
      return !map.has(ref) && !map.has(ref.replace(/^\.\//, ""));
    });
    for (const ref of missingImgs) {
      issues.push({
        severity: "fail",
        message: `${page.path} links to missing file "${ref}". Use inline SVG/CSS initials, or emit the asset.`,
      });
    }

    if (/grecaptcha|g-recaptcha/i.test(content) && !/<div[^>]*g-recaptcha/i.test(content)) {
      issues.push({
        severity: "fail",
        message: `${page.path} calls reCAPTCHA but has no widget — the contact form will always fail.`,
      });
    }

    if (/javascript:\s*void/i.test(content) || /href\s*=\s*["']#["']/.test(content)) {
      issues.push({
        severity: "fail",
        message: `${page.path} has a dead CTA (javascript:void(0) or href="#"). Use href="#contact" (or another real section id).`,
      });
    }
    if (/\son(?:click|submit|load)\s*=/i.test(content)) {
      issues.push({
        severity: "fail",
        message: `${page.path} uses inline JS handlers. Bind events with addEventListener in the script file.`,
      });
    }

    for (const a of htmlAnchors(content)) {
      if (!SOCIAL_HOST.test(a.href)) continue;
      const rel = a.rel.toLowerCase();
      if (a.target !== "_blank" || !rel.includes("noopener") || !rel.includes("noreferrer")) {
        issues.push({
          severity: "fail",
          message: `${page.path} external social link "${a.href}" needs target="_blank" rel="noopener noreferrer".`,
        });
      }
    }
  }

  const js = combinedScripts(files);
  if (!backendOnly && hasContactForm(htmlBlob)) {
    if (!/localStorage\.setItem/.test(js)) {
      issues.push({
        severity: "fail",
        message:
          "Contact form never writes to localStorage, so submissions cannot persist in preview.",
      });
    } else if (!persistsCollection(js)) {
      issues.push({
        severity: "fail",
        message:
          "Contact form overwrites a single localStorage key. Parse the existing JSON array, push the new entry, and save the array back.",
      });
    }
    if (hidesFormOnSubmit(js)) {
      issues.push({
        severity: "fail",
        message:
          "Submit handler hides the form with display:none. Keep the form visible and show a dedicated confirmation element.",
      });
    }
    if (/alert\s*\(/.test(js) && !/getElementById\(|querySelector\(/.test(js)) {
      issues.push({
        severity: "fail",
        message:
          "Contact feedback is alert-only. Show an on-page confirmation instead of (or in addition to) alert().",
      });
    }
  }

  for (const file of files) {
    for (const pattern of SECRETISH) {
      if (pattern.test(file.content)) {
        issues.push({
          severity: "fail",
          message: `${file.path} contains hardcoded secrets or dummy credentials. Use localStorage only for v1.`,
        });
      }
    }
  }

  const unique = new Map<string, ShipIssue>();
  for (const issue of issues) unique.set(issue.message, issue);
  const list = [...unique.values()];
  return {
    passed: list.every((i) => i.severity !== "fail"),
    issues: list,
  };
}
