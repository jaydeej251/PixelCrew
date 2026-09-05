import { isMismatchedMarketingHtml } from "./ship-quality";
import { inlineLinkedProjectAssets } from "./preview-inline";

export type ProjectFile = {
  path: string;
  content: string;
};

const ROLE_DUMP =
  /^(dispatcher|executive|project_manager|designer|tech_architect|engineer|frontend_engineer|backend_engineer|qa_engineer)\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/i;

const SKIP_NAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".git",
  ".gitignore",
]);

const LANGUAGE_ONLY = new Set([
  "json",
  "jsonc",
  "md",
  "markdown",
  "text",
  "txt",
  "bash",
  "sh",
  "shell",
  "ts",
  "tsx",
  "js",
  "jsx",
  "html",
  "css",
  "sql",
  "xml",
  "yaml",
  "yml",
  "diff",
  "plaintext",
]);

export const MAX_PROJECT_FILES = 40;
export const MAX_FILE_BYTES = 200_000;

export function normalizePath(raw: string): string | null {
  let path = raw.trim().replace(/\\/g, "/").replace(/^["'`]+|["'`]+$/g, "");
  path = path.replace(/^\.\//, "").replace(/^\/+/, "");
  if (!path || path.includes("\0")) return null;
  if (path.includes("..")) return null;
  if (path.startsWith("~") || /^[a-z]:/i.test(path)) return null;
  path = path.replace(/\/{2,}/g, "/");
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.some((p) => p === "." || p === ".." || SKIP_NAMES.has(p))) return null;
  const base = parts[parts.length - 1]!;
  if (SKIP_NAMES.has(base) || base.startsWith(".env")) return null;
  if (parts[0] === "node_modules" || parts[0] === ".git") return null;
  if (path.length > 180) return null;
  return parts.join("/");
}

export function isRoleDumpPath(path: string): boolean {
  return ROLE_DUMP.test(path);
}

export function isProjectPath(path: string | null | undefined): boolean {
  if (!path) return false;
  const n = normalizePath(path);
  if (!n) return false;
  return !isRoleDumpPath(n);
}

function looksLikePath(token: string): boolean {
  const n = normalizePath(token);
  if (!n) return false;
  if (LANGUAGE_ONLY.has(n.toLowerCase()) && !n.includes("/")) return false;
  return n.includes("/") || /\.[a-z0-9]{1,8}$/i.test(n);
}

function pathFromFenceMeta(meta: string): string | null {
  const trimmed = meta.trim();
  if (!trimmed) return null;

  const prefixed = trimmed.match(/^(?:file|path)\s*:\s*(.+)$/i);
  if (prefixed) return normalizePath(prefixed[1] ?? "");

  const colon = trimmed.match(/^[a-z0-9.+-]+\s*:\s*(.+)$/i);
  if (colon && looksLikePath(colon[1] ?? "")) return normalizePath(colon[1] ?? "");

  for (const token of trimmed.split(/\s+/)) {
    const cleaned = token.replace(/[,]+$/, "");
    if (looksLikePath(cleaned)) return normalizePath(cleaned);
  }
  return null;
}

/** Pull ` ```file:path ` (and similar) fences out of an agent reply. */
export function parseFileFences(text: string): ProjectFile[] {
  const files: ProjectFile[] = [];
  const seen = new Set<string>();
  const fence = /```([^\n`]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(text)) !== null) {
    const path = pathFromFenceMeta(match[1] ?? "");
    if (!path) continue;
    if (seen.has(path)) continue;
    let content = match[2] ?? "";
    if (content.startsWith("\n")) content = content.slice(1);
    content = content.replace(/\n+$/, "\n");
    if (content.length > MAX_FILE_BYTES) continue;
    seen.add(path);
    files.push({ path, content });
    if (files.length >= MAX_PROJECT_FILES) break;
  }

  if (files.length === 0) {
    const heading = /(?:^|\n)#{1,3}\s*(?:file|path)\s*:\s*([^\n]+)\n+```[^\n]*\n([\s\S]*?)```/gi;
    while ((match = heading.exec(text)) !== null) {
      const path = normalizePath(match[1] ?? "");
      if (!path || seen.has(path)) continue;
      seen.add(path);
      files.push({ path, content: (match[2] ?? "").replace(/\n+$/, "\n") });
    }
  }

  return files;
}

export function leftoverProse(text: string, files: ProjectFile[]): string {
  if (files.length === 0) return text.trim();
  let rest = text;
  for (const file of files) {
    rest = rest.replace(
      new RegExp("```[^\\n]*" + escapeRegExp(file.path) + "[^\\n]*\\n[\\s\\S]*?```", "i"),
      "",
    );
  }
  return rest.replace(/```[\s\S]*?```/g, "").trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function hasUnclosedFence(text: string): boolean {
  return (text.split("```").length - 1) % 2 === 1;
}

export function toFileFences(files: Record<string, string> | ProjectFile[]): string {
  const list = Array.isArray(files)
    ? files
    : Object.entries(files).map(([path, content]) => ({ path, content }));
  return list
    .map((f) => `\`\`\`file:${f.path}\n${f.content.replace(/\n+$/, "")}\n\`\`\``)
    .join("\n\n");
}

export function contentTypeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    html: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8",
    js: "text/javascript; charset=utf-8",
    mjs: "text/javascript; charset=utf-8",
    json: "application/json; charset=utf-8",
    svg: "image/svg+xml",
    txt: "text/plain; charset=utf-8",
    md: "text/markdown; charset=utf-8",
    map: "application/json; charset=utf-8",
    ico: "image/x-icon",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    woff: "font/woff",
    woff2: "font/woff2",
  };
  return map[ext] ?? "text/plain; charset=utf-8";
}

export function slugFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return slug || "note";
}

export type ArtifactLike = {
  type: string;
  title: string;
  content: string;
  filePath?: string | null;
  createdAt?: Date | string;
};

const SKIP_DOC_TITLES = new Set(["Plan Q&A", "Plan decisions", "Plan published"]);

export function projectFilesFromArtifacts(artifacts: ArtifactLike[]): Map<string, string> {
  const sorted = [...artifacts].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });
  const files = new Map<string, string>();
  for (const a of sorted) {
    if (!isProjectPath(a.filePath)) continue;
    const path = normalizePath(a.filePath!)!;
    files.set(path, a.content);
  }
  return files;
}

export function docsFromArtifacts(artifacts: ArtifactLike[]): Map<string, string> {
  const docs = new Map<string, string>();
  for (const a of artifacts) {
    if (SKIP_DOC_TITLES.has(a.title)) continue;
    if (isProjectPath(a.filePath)) continue;
    const name = slugFileName(a.title);
    docs.set(`docs/${name}.md`, `# ${a.title}\n\n${a.content}`);
  }
  return docs;
}

function defaultReadme(ceoGoal: string, hasAgentHtml: boolean, isNode: boolean): string {
  const extra = isNode && !hasAgentHtml
    ? `\nIf this looks like a Node/Next app:\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n`
    : "";
  return `# PixelCrew export

Goal: ${ceoGoal}

This zip is a developer export from a PixelCrew run. It is not a deployed URL.

Non-developers: use **Save app (HTML)** or **Open your app** in the office — no terminal required.

## Run locally (developers)

Interactive apps (calculator, taskboard, forms) need a local static server — do not rely on double-clicking \`index.html\` (\`file://\` breaks many scripts).

\`\`\`bash
npx --yes serve .
\`\`\`

Then open the URL it prints (usually http://localhost:3000). Static apps also preview in the PixelCrew office.
${extra}`;
}

function defaultPackageJson(ceoGoal: string): string {
  return `${JSON.stringify(
    {
      name: "pixelcrew-export",
      private: true,
      version: "0.1.0",
      description: ceoGoal.trim(),
      scripts: {
        start: "npx --yes serve .",
        dev: "npx --yes serve .",
      },
    },
    null,
    2,
  )}\n`;
}

/** Packager-injected stub — never treat as a shipped product page. */
export function isPackagerFallbackHtml(content: string): boolean {
  return (
    /data-pixelcrew-missing-build\s*=\s*["']1["']/i.test(content) ||
    /<title>\s*PixelCrew export\s*<\/title>/i.test(content) ||
    /This export is a project folder/i.test(content) ||
    /No previewable app in this run/i.test(content)
  );
}

function isRealPreviewHtml(path: string, content: string, ceoGoal = ""): boolean {
  if (!/\.html?$/i.test(path)) return false;
  if (isPackagerFallbackHtml(content)) return false;
  if (ceoGoal && isMismatchedMarketingHtml(content, ceoGoal)) return false;
  return true;
}

function missingBuildHtml(ceoGoal: string, files: string[]): string {
  const items = files
    .filter((f) => f !== "index.html")
    .map((f) => `<li><code>${escapeHtml(f)}</code></li>`)
    .join("\n");
  const isNode = files.includes("package.json") && files.some((f) => /\.(tsx?|jsx?)$/.test(f));
  return `<!DOCTYPE html>
<html lang="en" data-pixelcrew-missing-build="1">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>No app to preview</title>
  <style>
    :root { color-scheme: dark; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; background: #09090b; color: #fafafa; }
    main { max-width: 42rem; margin: 0 auto; padding: 2rem 1.25rem; }
    h1 { font-size: 1.25rem; }
    .banner { background: #3f1d1d; border: 1px solid #7f1d1d; color: #fecaca; padding: 0.75rem 1rem; border-radius: 0.5rem; margin-bottom: 1.25rem; }
    p, li { color: #a1a1aa; line-height: 1.5; }
    pre { background: #18181b; padding: 1rem; border-radius: 0.75rem; overflow: auto; }
    code { font-family: ui-monospace, monospace; font-size: 0.85em; }
  </style>
</head>
<body>
  <main>
    <p class="banner"><strong>Missing build</strong> — this is not a shipped app. Engineers did not emit previewable HTML for this run.</p>
    <h1>No previewable app in this run</h1>
    <p>Goal: ${escapeHtml(ceoGoal)}</p>
    <p>${
      isNode
        ? "This run looks like a Node/Next project. In-office preview only serves static HTML — unzip the export and run the commands below on your machine."
        : "No index.html (or other HTML) was found among the run’s project files. Open Files to inspect what was emitted, or re-run so engineers ship a static index.html."
    }</p>
    <pre>${isNode ? "npm install\nnpm run dev" : "npx --yes serve ."}</pre>
    <h2>Files found</h2>
    <ul>
${items || "      <li><em>None</em></li>"}
    </ul>
  </main>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function assembleProject(opts: {
  ceoGoal: string;
  artifacts: ArtifactLike[];
}): Map<string, string> {
  const files = projectFilesFromArtifacts(opts.artifacts);
  for (const [path, content] of docsFromArtifacts(opts.artifacts)) {
    if (!files.has(path)) files.set(path, content);
  }

  // Drop packager stubs and wrong-product marketing portfolios so Preview never serves them.
  for (const [path, content] of [...files.entries()]) {
    if (isPackagerFallbackHtml(content)) {
      files.delete(path);
      continue;
    }
    if (/\.html?$/i.test(path) && isMismatchedMarketingHtml(content, opts.ceoGoal)) {
      files.delete(path);
    }
  }

  const paths = [...files.keys()];
  const hasRealHtml = [...files.entries()].some(([path, content]) =>
    isRealPreviewHtml(path, content, opts.ceoGoal),
  );
  const isNode = paths.some((f) => /\.(tsx?|jsx?)$/.test(f)) && paths.includes("package.json");
  if (!files.has("package.json")) {
    files.set("package.json", defaultPackageJson(opts.ceoGoal));
  }
  if (!files.has("README.md")) {
    files.set("README.md", defaultReadme(opts.ceoGoal, hasRealHtml, isNode));
  }
  // Only inject a missing-build page when there is truly nothing to open in preview.
  // Do not invent a PixelCrew product index when real HTML exists under another name.
  if (!hasRealHtml) {
    files.set("index.html", missingBuildHtml(opts.ceoGoal, [...files.keys()]));
  }
  return files;
}

export function findPreviewIndex(files: Map<string, string>, ceoGoal = ""): string {
  const entries = [...files.entries()];
  const realRoot = entries.find(
    ([path, content]) => path === "index.html" && isRealPreviewHtml(path, content, ceoGoal),
  );
  if (realRoot) return realRoot[0];

  const realNested = entries.find(
    ([path, content]) => path.endsWith("/index.html") && isRealPreviewHtml(path, content, ceoGoal),
  );
  if (realNested) return realNested[0];

  const anyReal = entries.find(([path, content]) => isRealPreviewHtml(path, content, ceoGoal));
  if (anyReal) return anyReal[0];

  if (files.has("index.html")) return "index.html";
  const nested = [...files.keys()].find((p) => p.endsWith("/index.html"));
  if (nested) return nested;
  const anyHtml = [...files.keys()].find((p) => p.endsWith(".html"));
  return anyHtml ?? "index.html";
}

export function injectBaseHref(
  html: string,
  runId: string,
  filePath = "index.html",
  baseRoot = `/api/runs/${runId}/preview/`,
): string {
  const dir = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/") + 1) : "";
  const base = `<base href="${baseRoot}${dir}">`;
  if (/<base\s/i.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}\n    ${base}`);
  }
  return `<head>${base}</head>\n${html}`;
}

export function canPreview(artifacts: ArtifactLike[], ceoGoal = ""): boolean {
  const files = projectFilesFromArtifacts(artifacts);
  if (
    [...files.entries()].some(([path, content]) => isRealPreviewHtml(path, content, ceoGoal))
  ) {
    return true;
  }
  return files.size > 0 || artifacts.some((a) => a.type === "code");
}

/** True when preview would open a real shipped HTML page (not the missing-build stub). */
export function hasPreviewableApp(artifacts: ArtifactLike[], ceoGoal = ""): boolean {
  const files = projectFilesFromArtifacts(artifacts);
  return [...files.entries()].some(([path, content]) =>
    isRealPreviewHtml(path, content, ceoGoal),
  );
}

/** README / package.json / index.html the packager must add because agents omitted them. */
export function scaffoldGaps(opts: {
  ceoGoal: string;
  artifacts: ArtifactLike[];
}): ProjectFile[] {
  const existing = projectFilesFromArtifacts(opts.artifacts);
  const assembled = assembleProject(opts);
  const gaps: ProjectFile[] = [];
  for (const key of ["README.md", "package.json", "index.html"] as const) {
    const next = assembled.get(key);
    if (!next) continue;
    const prior = existing.get(key);
    if (!prior || (key === "index.html" && isPackagerFallbackHtml(prior))) {
      gaps.push({ path: key, content: next });
    }
  }
  return gaps;
}

/**
 * Build one self-contained HTML file for non-dev download (double-click / email).
 * Inlines linked stylesheets and external scripts from the assembled project map.
 */
export function assembleSingleFileHtml(
  files: Map<string, string>,
  ceoGoal = "",
): string | null {
  const indexPath = findPreviewIndex(files, ceoGoal);
  const source = files.get(indexPath);
  if (!source) return null;
  return inlineLinkedProjectAssets(source, indexPath, files);
}
