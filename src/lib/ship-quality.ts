import {
  missingProductHints,
  productHintsFromGoal,
  violatedForbiddenTerms,
} from "./goal-fidelity";
import { needsStagedUiBuild } from "./ui-build-pipeline";
import {
  ensureHtmlLinksUtilitiesCss,
  ensureHtmlWorkspaceShellClass,
  utilitiesCssFile,
} from "./pixel-utilities-css";

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

const STUB_STYLES_CSS =
  "/* App-specific overrides. Theme tokens live in utilities.css (PixelCrew Tailwind-lite). */\n";
const STUB_APP_JS = `document.addEventListener("DOMContentLoaded", () => {
  console.log("UI shell ready");
});
`;

const PALETTE_STUB = `<aside id="palette" class="sidebar">
  <h2>Node palette</h2>
  <p class="empty-hint">Drag tools onto the workspace.</p>
  <button type="button" class="node-card"><span class="node-header">Number</span><span class="socket"></span></button>
</aside>`;

const PROPERTIES_STUB = `<aside id="properties" class="inspector">
  <h2>Properties</h2>
  <p class="empty-hint">Select a node to inspect it.</p>
  <label>Value <input id="prop-value" type="text"></label>
</aside>`;

const WORKSPACE_MAIN_OPEN = `<main id="workspace" class="workspace">`;
const WORKSPACE_MAIN_CLOSE = `</main>`;

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

/** Preview + zip need relative asset paths; strip a leading slash. */
export function rewriteRootAbsoluteAssets(html: string): string {
  return html.replace(
    /((?:src|href)\s*=\s*["'])\/(?!\/)([^"']+)(["'])/gi,
    (_m, pre: string, path: string, quote: string) => `${pre}${path}${quote}`,
  );
}

const WORKSPACE_CANVAS_STUB =
  `<div class="canvas-wrap"><canvas id="canvas" width="1200" height="800" aria-label="Workspace canvas"></canvas></div>`;

/** Insert a workspace <canvas> when the goal needs one but the model only emitted HTML chrome. */
export function ensureWorkspaceCanvas(html: string): string {
  if (/<(canvas|svg)\b/i.test(html)) return html;

  if (/<\/main>/i.test(html)) {
    return html.replace(/<\/main>/i, `${WORKSPACE_CANVAS_STUB}</main>`);
  }
  if (/id\s*=\s*["'][^"']*(workspace|stage|board|graph)[^"']*["']/i.test(html)) {
    return html.replace(
      /(<[^>]+\bid\s*=\s*["'][^"']*(?:workspace|stage|board|graph)[^"']*["'][^>]*>)/i,
      `$1${WORKSPACE_CANVAS_STUB}`,
    );
  }
  if (/class\s*=\s*["'][^"']*(workspace|canvas-wrap)[^"']*["']/i.test(html)) {
    return html.replace(
      /(<[^>]+\bclass\s*=\s*["'][^"']*(?:workspace|canvas-wrap)[^"']*["'][^>]*>)/i,
      `$1${WORKSPACE_CANVAS_STUB}`,
    );
  }
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${WORKSPACE_CANVAS_STUB}</body>`);
  }
  return `${html}\n${WORKSPACE_CANVAS_STUB}`;
}

/**
 * Fill missing 3-pane chrome for staged editor goals so ship eval does not abort
 * on "sidebar / inspector / node-card" when the model emitted a thin vertical mock.
 */
export function ensureMinimalWorkspaceChrome(html: string): string {
  let out = html;
  const hasSidebar =
    /<(aside|nav)\b/i.test(out) ||
    /\bid\s*=\s*["'][^"']*(sidebar|palette|tools|toolbar)[^"']*["']/i.test(out) ||
    /\bclass\s*=\s*["'][^"']*(sidebar|palette|toolbar)[^"']*["']/i.test(out);
  const hasProperties =
    /\bid\s*=\s*["'][^"']*(properties|inspector|details|settings)[^"']*["']/i.test(out) ||
    /\bclass\s*=\s*["'][^"']*(properties|inspector)[^"']*["']/i.test(out) ||
    /<(aside|section)\b[^>]*(properties|inspector)/i.test(out);
  const hasNodeCards =
    /\b(node-card|graph-node|flow-node|socket|port)\b/i.test(out) ||
    (out.match(/<div\b[^>]*class\s*=\s*["'][^"']*node/gi)?.length ?? 0) >= 1;
  const hasMain =
    /<(main)\b/i.test(out) ||
    /\bid\s*=\s*["'][^"']*(canvas|workspace|stage|board|graph)[^"']*["']/i.test(out);

  if (!hasMain && /<body\b[^>]*>/i.test(out) && /<\/body>/i.test(out)) {
    out = out.replace(/<body\b([^>]*)>/i, `<body$1>\n${WORKSPACE_MAIN_OPEN}`);
    out = out.replace(/<\/body>/i, `${WORKSPACE_MAIN_CLOSE}\n</body>`);
  }

  if (!hasSidebar) {
    if (/<body\b[^>]*>/i.test(out)) {
      out = out.replace(/<body\b([^>]*)>/i, `<body$1>\n${PALETTE_STUB}`);
    } else {
      out = `${PALETTE_STUB}\n${out}`;
    }
  } else if (!hasNodeCards) {
    out = out.replace(
      /(<(?:aside|nav)\b[^>]*(?:sidebar|palette|tools|toolbar)[^>]*>)/i,
      `$1\n<button type="button" class="node-card"><span class="node-header">Node</span><span class="socket"></span></button>`,
    );
    if (!/\b(node-card|socket)\b/i.test(out)) {
      out = out.replace(
        /<(aside|nav)\b([^>]*)>/i,
        `<$1$2>\n<button type="button" class="node-card"><span class="node-header">Node</span><span class="socket"></span></button>`,
      );
    }
  }

  if (!hasProperties) {
    if (/<\/body>/i.test(out)) {
      out = out.replace(/<\/body>/i, `${PROPERTIES_STUB}\n</body>`);
    } else {
      out = `${out}\n${PROPERTIES_STUB}`;
    }
  }

  return out;
}

function goalWantsCanvas(ceoGoal: string): boolean {
  return /\b(canvas|bezier|node[- ]?based|flow editor|visual flow|blueprint)\b/i.test(
    ceoGoal,
  );
}

/**
 * Ensure the CEO product name appears in HTML (title / heading) so fidelity
 * checks do not abort when the model shipped a generic "Editor" shell.
 */
export function ensureProductMention(html: string, ceoGoal: string): string {
  const hints = productHintsFromGoal(ceoGoal);
  if (hints.length === 0) return html;
  const lower = html.toLowerCase();
  if (hints.some((h) => lower.includes(h.toLowerCase()))) return html;

  const primary =
    hints.find((h) => /(?:Flow|Board|App|Tracker|Hub|Kit|Lab|Desk|Pad|Pulse|Ledger)$/i.test(h)) ??
    hints[0]!;
  let out = html;
  if (/<title\b[^>]*>[\s\S]*?<\/title>/i.test(out)) {
    out = out.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, `<title>${primary}</title>`);
  } else if (/<head\b[^>]*>/i.test(out)) {
    out = out.replace(/<head\b[^>]*>/i, (m) => `${m}\n<title>${primary}</title>`);
  }
  if (!/<h1\b/i.test(out) && /<body\b[^>]*>/i.test(out)) {
    out = out.replace(/<body\b([^>]*)>/i, `<body$1>\n<h1>${primary}</h1>`);
  } else if (/<h1\b[^>]*>[\s\S]*?<\/h1>/i.test(out)) {
    out = out.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i, `<h1>${primary}</h1>`);
  } else if (/id\s*=\s*["']workspace["']/i.test(out)) {
    out = out.replace(
      /(<[^>]+\bid\s*=\s*["']workspace["'][^>]*>)/i,
      `$1\n<h1>${primary}</h1>`,
    );
  } else if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `<h1>${primary}</h1>\n</body>`);
  } else {
    out = `${out}\n<h1>${primary}</h1>`;
  }
  return out;
}

function utilitiesLooksComplete(content: string): boolean {
  return content.length > 400 && /--pc-bg\s*:/i.test(content);
}

/**
 * Fill Preview-critical gaps the model forgot in the same turn — BEFORE ship eval
 * (must match post-persist Preview hardening, or runs abort on gaps Preview would fix).
 */
export function augmentProjectFilesForShipEval(
  files: ProjectFile[],
  opts: { ceoGoal?: string; stage?: "shell" | "full" } = {},
): ProjectFile[] {
  const map = new Map<string, string>();
  for (const f of files) {
    map.set(f.path.replace(/^\.\//, ""), f.content);
  }

  const ceoGoal = opts.ceoGoal ?? "";
  const staged = needsStagedUiBuild(ceoGoal);
  const wantsCanvas = goalWantsCanvas(ceoGoal);

  for (const [path, content] of [...map.entries()]) {
    if (!/\.html?$/i.test(path)) continue;
    let html = rewriteRootAbsoluteAssets(content);
    if (staged) {
      html = ensureMinimalWorkspaceChrome(html);
    }
    if (wantsCanvas) {
      html = ensureWorkspaceCanvas(html);
    }
    html = ensureProductMention(html, ceoGoal);
    if (staged || /utilities\.css/i.test(html)) {
      html = ensureHtmlLinksUtilitiesCss(html);
      html = ensureHtmlWorkspaceShellClass(html);
    }
    map.set(path, html);
  }

  const htmlBlob = [...map.entries()]
    .filter(([p]) => /\.html?$/i.test(p))
    .map(([, c]) => c)
    .join("\n");

  const wantsUtils = /utilities\.css/i.test(htmlBlob) || staged;
  const util = utilitiesCssFile();

  // Always prefer the real Tailwind-lite pack — models often emit a 1-line stub
  // named utilities.css that would otherwise block dark-theme evidence.
  if (wantsUtils) {
    const existing = map.get(util.path) ?? map.get("utilities.css");
    if (!existing || !utilitiesLooksComplete(existing)) {
      map.set(util.path, util.content);
    }
  }

  // Default styles.css / app.js links for staged shells that forgot them.
  if (staged) {
    for (const [path, content] of [...map.entries()]) {
      if (!/\.html?$/i.test(path)) continue;
      let html = content;
      if (!/\bstyles\.css\b/i.test(html) && /utilities\.css/i.test(html)) {
        html = html.replace(
          /(<link\b[^>]*utilities\.css[^>]*>)/i,
          `$1\n    <link rel="stylesheet" href="styles.css">`,
        );
      }
      if (!/\bapp\.js\b/i.test(html) && /<\/body>/i.test(html)) {
        html = html.replace(/<\/body>/i, `<script src="app.js"></script>\n</body>`);
      }
      map.set(path, html);
    }
  }

  const htmlAfter = [...map.entries()]
    .filter(([p]) => /\.html?$/i.test(p))
    .map(([, c]) => c)
    .join("\n");

  for (const content of htmlAfter ? [htmlAfter] : []) {
    for (const rawRef of localAssetRefs(content)) {
      const path = rawRef.replace(/^\.\//, "");
      if (map.has(path)) continue;
      if (/utilities\.css$/i.test(path)) {
        map.set(path, util.content);
        continue;
      }
      if (/\.css$/i.test(path)) {
        map.set(path, STUB_STYLES_CSS);
        continue;
      }
      if (/\.m?js$/i.test(path)) {
        map.set(path, STUB_APP_JS);
      }
    }
  }

  for (const [path, content] of [...map.entries()]) {
    if (!/\.html?$/i.test(path)) continue;
    for (const rawRef of localAssetRefs(content)) {
      const ref = rawRef.replace(/^\.\//, "");
      if (map.has(ref)) continue;
      if (/utilities\.css$/i.test(ref)) map.set(ref, util.content);
      else if (/\.css$/i.test(ref)) map.set(ref, STUB_STYLES_CSS);
      else if (/\.m?js$/i.test(ref)) map.set(ref, STUB_APP_JS);
    }
  }

  return [...map.entries()].map(([path, content]) => ({ path, content }));
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

/** Workspace/editor apps must not ship a bare-canvas MVP or unstyled document. */
export function collectUiRichnessIssues(
  files: ProjectFile[],
  ceoGoal: string,
): ShipIssue[] {
  if (!needsStagedUiBuild(ceoGoal)) return [];

  const issues: ShipIssue[] = [];
  const html = htmlFiles(files)
    .map((f) => f.content)
    .join("\n");
  const css = files
    .filter((f) => /\.css$/i.test(f.path))
    .map((f) => f.content)
    .join("\n");
  const blob = `${html}\n${css}`.toLowerCase();
  const wantsCanvas = goalWantsCanvas(ceoGoal);

  const hasSidebar =
    /<(aside|nav)\b/i.test(html) ||
    /\bid\s*=\s*["'][^"']*(sidebar|palette|tools|toolbar)[^"']*["']/i.test(html) ||
    /\bclass\s*=\s*["'][^"']*(sidebar|palette|toolbar)[^"']*["']/i.test(html);
  const hasCanvasOrSvg = /<(canvas|svg)\b/i.test(html);
  const hasMainWorkspace =
    hasCanvasOrSvg ||
    /\bid\s*=\s*["'][^"']*(canvas|workspace|stage|board|graph)[^"']*["']/i.test(html) ||
    (/<(main)\b/i.test(html) && !wantsCanvas);
  const hasProperties =
    /\bid\s*=\s*["'][^"']*(properties|inspector|details|settings)[^"']*["']/i.test(html) ||
    /\bclass\s*=\s*["'][^"']*(properties|inspector)[^"']*["']/i.test(html) ||
    /<(aside|section)\b[^>]*(properties|inspector)/i.test(html);
  const hasNodeCards =
    /\b(node-card|graph-node|flow-node|socket|port)\b/i.test(blob) ||
    (html.match(/<div\b[^>]*class\s*=\s*["'][^"']*node/gi)?.length ?? 0) >= 1;
  const canvasHeavy =
    /<canvas\b/i.test(html) &&
    !hasSidebar &&
    (html.replace(/<canvas[\s\S]*?<\/canvas>/gi, "").replace(/<[^>]+>/g, " ").trim().length <
      120);
  const linksStylesheet =
    /<link\b[^>]*\brel\s*=\s*["'][^"']*stylesheet[^"']*["'][^>]*>/i.test(html) ||
    /<style\b/i.test(html);
  const linksUtilities = /utilities\.css/i.test(html);
  const hasUtilitiesFile = files.some(
    (f) => /utilities\.css$/i.test(f.path) && f.content.length > 400,
  );
  const hasChromeLayout =
    /\b(app-shell|layout-3pane)\b/i.test(html) ||
    /grid-template-columns\s*:\s*[^;]{0,80}(1fr|minmax)/i.test(css);
  const hasDarkTheme =
    /--pc-bg\s*:/i.test(css) ||
    /color-scheme\s*:\s*dark/i.test(css) ||
    /background(?:-color)?\s*:\s*#0[0-9a-f]{2,5}\b/i.test(css) ||
    (linksUtilities && hasUtilitiesFile);

  if (!linksStylesheet) {
    issues.push({
      severity: "fail",
      message:
        "index.html does not link any stylesheet. Link utilities.css (local Tailwind-lite) so Preview is not an unstyled white document.",
    });
  }
  if (hasUtilitiesFile && !linksUtilities && !/<style\b/i.test(html)) {
    issues.push({
      severity: "fail",
      message:
        "utilities.css exists but index.html does not link it. Add <link rel=\"stylesheet\" href=\"utilities.css\"> or Preview stays unstyled.",
    });
  }
  if (!hasChromeLayout) {
    issues.push({
      severity: "fail",
      message:
        "Missing 3-pane workspace layout (class=\"app-shell\" / \"layout-3pane\" from utilities.css, or CSS grid with sidebars + main). Do not ship a vertical stack of headings.",
    });
  }
  if (!hasDarkTheme) {
    issues.push({
      severity: "fail",
      message:
        "Missing dark-mode theme evidence (:root/--pc-bg or linked utilities.css). PixelFlow-style editors must not ship default white browser chrome.",
    });
  }
  if (!hasSidebar) {
    issues.push({
      severity: "fail",
      message:
        "Workspace UI is missing a tool/palette sidebar (aside/nav or #sidebar/#palette). Do not ship a bare canvas — add HTML chrome.",
    });
  }
  if (wantsCanvas && !hasCanvasOrSvg) {
    issues.push({
      severity: "fail",
      message:
        "Goal asks for an interactive canvas/SVG workspace, but no <canvas> or <svg> was emitted.",
    });
  }
  if (!hasMainWorkspace) {
    issues.push({
      severity: "fail",
      message:
        "Workspace UI is missing a main canvas/workspace region (#canvas, #workspace, <main>, or <canvas>).",
    });
  }
  if (!hasProperties && !hasNodeCards) {
    issues.push({
      severity: "fail",
      message:
        "Workspace UI needs either a properties/inspector panel or HTML node cards with sockets — not only shapes drawn on canvas.",
    });
  }
  if (canvasHeavy) {
    issues.push({
      severity: "fail",
      message:
        "Output looks like a stripped canvas-only MVP. Rebuild with HTML sidebars, toolbars, and styled node cards; use canvas/SVG for grid/cables only.",
    });
  }
  return issues;
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

/**
 * Parse-check classic script bodies. Incomplete LLM emits (cut mid-template-string)
 * otherwise ship to Preview as Uncaught SyntaxError and kill all interactivity.
 */
export function javascriptSyntaxError(source: string): string | null {
  const trimmed = source.trim();
  if (!trimmed) return null;
  // Soften ESM keywords so we still catch truncation; Preview prefers classic scripts.
  const probe = trimmed
    .replace(/\bexport\s+default\s+/g, "")
    .replace(/\bexport\s+(?:async\s+)?function\b/g, "function")
    .replace(/\bexport\s+(?:const|let|var|class)\b/g, (m) => m.replace(/^export\s+/, ""))
    .replace(/^\s*import\s+[^;]+;?\s*$/gm, "");
  try {
    // Function body parse — catches Unexpected end of input / unexpected token.
    // eslint-disable-next-line no-new-func -- intentional syntax probe, never executed
    new Function(probe);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export function collectJavascriptSyntaxIssues(files: ProjectFile[]): ShipIssue[] {
  const issues: ShipIssue[] = [];
  for (const file of files) {
    if (!/\.m?js$/i.test(file.path)) continue;
    const err = javascriptSyntaxError(file.content);
    if (!err) continue;
    issues.push({
      severity: "fail",
      message:
        `${file.path} has a JavaScript syntax error (${err}). ` +
        `The file looks truncated or incomplete — Preview will throw Uncaught SyntaxError ` +
        `and forms/buttons will not work (CSP may also block native form posts). ` +
        `Re-emit the COMPLETE file in one \`\`\`file:${file.path} fence.`,
    });
  }
  for (const file of files) {
    if (!/\.html?$/i.test(file.path)) continue;
    const inline = [
      ...file.content.matchAll(
        /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi,
      ),
    ];
    for (const match of inline) {
      const body = (match[1] ?? "").trim();
      if (!body) continue;
      const err = javascriptSyntaxError(body);
      if (!err) continue;
      issues.push({
        severity: "fail",
        message:
          `${file.path} has an inline <script> syntax error (${err}). ` +
          `Finish the script or move it to a complete .js file.`,
      });
    }
  }
  return issues;
}

/** Inspect emitted project files the way a preview user would. */
export function evalShippedProject(
  files: ProjectFile[],
  opts: { role?: string; ceoGoal?: string; stage?: "shell" | "full" } = {},
): ShipReport {
  const issues: ShipIssue[] = [];
  const role = opts.role ?? "";
  const ceoGoal = opts.ceoGoal ?? "";
  const stage = opts.stage ?? "full";
  const backendOnly = role === "backend_engineer";
  // Auto-fill utilities.css + stub linked CSS/JS the model linked but forgot to emit.
  const working = backendOnly
    ? files
    : augmentProjectFilesForShipEval(files, { ceoGoal, stage });
  const map = fileMap(working);
  const html = htmlFiles(working);
  const htmlBlob = html.map((p) => p.content).join("\n");

  if (!backendOnly && html.length === 0) {
    issues.push({
      severity: "fail",
      message: "No index.html (or other HTML) was emitted — preview will be empty.",
    });
  }

  issues.push(...collectJavascriptSyntaxIssues(working));

  if (!backendOnly && html.length > 0 && ceoGoal.trim()) {
    if (isMismatchedMarketingHtml(htmlBlob, ceoGoal)) {
      issues.push({
        severity: "fail",
        message:
          "HTML looks like a PixelCrew / ColorVision / NeuralArt marketing portfolio, but that is not the CEO product. Rebuild around the goal name and features (e.g. PulseBoard) — force a full rewrite.",
      });
    }

    const blob = `${htmlBlob}\n${working.map((f) => f.content).join("\n")}`;
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

    issues.push(...collectUiRichnessIssues(working, ceoGoal));
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

    if (/javascript:\s*void/i.test(content)) {
      issues.push({
        severity: "fail",
        message: `${page.path} has a dead CTA (javascript:void(0)). Use a real button or href="#section-id".`,
      });
    } else if (/href\s*=\s*["']#["']/.test(content)) {
      // Common in editor chrome; Preview still works. Prefer real ids but do not abort.
      issues.push({
        severity: "warn",
        message: `${page.path} has href="#" placeholders. Prefer real section ids or <button type="button">.`,
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

  const js = combinedScripts(working);
  if (!backendOnly && stage !== "shell" && hasContactForm(htmlBlob)) {
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

  for (const file of working) {
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
