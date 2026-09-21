/** Local Tailwind-lite utility pack — works under Preview CSP (no CDN). */
export const UTILITIES_CSS_PATH = "utilities.css";

/**
 * Compact dark-theme utility classes agents can use instead of inventing
 * large custom CSS (saves tokens; Preview-safe because it is a local file).
 */
export const PIXEL_UTILITIES_CSS = `/* PixelCrew utilities.css — local Tailwind-lite (no CDN) */
:root {
  --pc-bg: #0b1220;
  --pc-panel: #111827;
  --pc-panel-2: #1f2937;
  --pc-border: #334155;
  --pc-text: #e5e7eb;
  --pc-muted: #94a3b8;
  --pc-accent: #38bdf8;
  --pc-accent-2: #818cf8;
  --pc-danger: #f87171;
  --pc-ok: #34d399;
  --pc-radius: 10px;
  --pc-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  color-scheme: dark;
}
*, *::before, *::after { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
  background: var(--pc-bg);
  color: var(--pc-text);
  line-height: 1.45;
}
a { color: var(--pc-accent); }
button, input, select, textarea {
  font: inherit;
  color: inherit;
}
button, .btn {
  cursor: pointer;
  border: 1px solid var(--pc-border);
  background: var(--pc-panel-2);
  color: var(--pc-text);
  border-radius: 8px;
  padding: 0.45rem 0.75rem;
}
button:hover, .btn:hover { border-color: var(--pc-accent); }
button:focus-visible, .btn:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
  outline: 2px solid var(--pc-accent);
  outline-offset: 2px;
}
.btn-primary, button.primary {
  background: linear-gradient(135deg, var(--pc-accent), var(--pc-accent-2));
  border-color: transparent;
  color: #0b1220;
  font-weight: 600;
}
input, select, textarea {
  width: 100%;
  background: var(--pc-bg);
  border: 1px solid var(--pc-border);
  border-radius: 8px;
  padding: 0.45rem 0.6rem;
}
.app-shell, .layout-3pane {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 280px;
}
@media (max-width: 960px) {
  .app-shell, .layout-3pane { grid-template-columns: 1fr; }
}
.sidebar, .inspector, .panel {
  background: var(--pc-panel);
  border-right: 1px solid var(--pc-border);
  padding: 0.75rem;
}
.inspector { border-right: 0; border-left: 1px solid var(--pc-border); }
.workspace, .canvas-wrap {
  position: relative;
  min-height: 60vh;
  background:
    linear-gradient(rgba(51, 65, 85, 0.35) 1px, transparent 1px) 0 0 / 24px 24px,
    linear-gradient(90deg, rgba(51, 65, 85, 0.35) 1px, transparent 1px) 0 0 / 24px 24px,
    var(--pc-bg);
}
.card, .node-card {
  background: var(--pc-panel-2);
  border: 1px solid var(--pc-border);
  border-radius: var(--pc-radius);
  box-shadow: var(--pc-shadow);
  padding: 0.75rem;
}
.node-card .node-header {
  font-weight: 600;
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.socket, .port {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--pc-accent);
  border: 2px solid var(--pc-bg);
  display: inline-block;
}
.toolbar {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background: var(--pc-panel);
  border-bottom: 1px solid var(--pc-border);
}
.empty-hint {
  color: var(--pc-muted);
  text-align: center;
  padding: 2rem 1rem;
}
.flex { display: flex; }
.inline-flex { display: inline-flex; }
.grid { display: grid; }
.hidden { display: none !important; }
.block { display: block; }
.items-center { align-items: center; }
.items-start { align-items: flex-start; }
.justify-between { justify-content: space-between; }
.justify-center { justify-content: center; }
.flex-col { flex-direction: column; }
.flex-wrap { flex-wrap: wrap; }
.gap-1 { gap: 0.25rem; }
.gap-2 { gap: 0.5rem; }
.gap-3 { gap: 0.75rem; }
.gap-4 { gap: 1rem; }
.p-2 { padding: 0.5rem; }
.p-3 { padding: 0.75rem; }
.p-4 { padding: 1rem; }
.px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
.py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
.m-0 { margin: 0; }
.mt-2 { margin-top: 0.5rem; }
.mb-2 { margin-bottom: 0.5rem; }
.mb-3 { margin-bottom: 0.75rem; }
.w-full { width: 100%; }
.h-full { height: 100%; }
.min-h-screen { min-height: 100vh; }
.rounded { border-radius: 8px; }
.rounded-lg { border-radius: var(--pc-radius); }
.border { border: 1px solid var(--pc-border); }
.border-b { border-bottom: 1px solid var(--pc-border); }
.bg-panel { background: var(--pc-panel); }
.bg-panel-2 { background: var(--pc-panel-2); }
.text-muted { color: var(--pc-muted); }
.text-sm { font-size: 0.875rem; }
.text-xs { font-size: 0.75rem; }
.text-lg { font-size: 1.125rem; }
.font-semibold { font-weight: 600; }
.font-bold { font-weight: 700; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.shadow { box-shadow: var(--pc-shadow); }
.overflow-auto { overflow: auto; }
.relative { position: relative; }
.absolute { position: absolute; }
.inset-0 { inset: 0; }
`;

export function utilitiesCssFile(): { path: string; content: string } {
  return { path: UTILITIES_CSS_PATH, content: PIXEL_UTILITIES_CSS };
}

/** Ensure HTML links the local Tailwind-lite pack (file alone does nothing if unlinked). */
export function ensureHtmlLinksUtilitiesCss(html: string): string {
  if (/utilities\.css/i.test(html)) return html;
  const link = `<link rel="stylesheet" href="${UTILITIES_CSS_PATH}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}\n    ${link}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (m) => `${m}\n<head>${link}</head>`);
  }
  return `<head>${link}</head>\n${html}`;
}

/** Prefer a 3-pane shell class when workspace HTML has no layout chrome classes. */
export function ensureHtmlWorkspaceShellClass(html: string): string {
  if (/\b(app-shell|layout-3pane)\b/i.test(html)) return html;
  // Wrap body contents only when body exists and has no shell class yet.
  if (/<body\b[^>]*>/i.test(html) && !/<body\b[^>]*\bclass\s*=/i.test(html)) {
    return html.replace(/<body\b([^>]*)>/i, `<body$1 class="app-shell">`);
  }
  if (/<body\b([^>]*)\bclass\s*=\s*(["'])([^"']*)\2/i.test(html)) {
    return html.replace(
      /<body\b([^>]*)\bclass\s*=\s*(["'])([^"']*)\2/i,
      (_m, pre: string, q: string, cls: string) =>
        `<body${pre}class=${q}${cls} app-shell${q}`,
    );
  }
  return html;
}

