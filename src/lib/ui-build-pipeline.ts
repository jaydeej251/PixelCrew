/**
 * Staged first-build pipeline for complex workspace apps.
 * Avoids single-shot overload (layout + CSS + math + state in one emit).
 */

export const IMPLEMENT_UI_SHELL_TITLE = "Implement UI shell from the plan";
export const IMPLEMENT_APP_LOGIC_TITLE = "Implement app logic from the plan";

/** Goals that need a real chrome (sidebars/panels), not a bare canvas MVP. */
export function needsStagedUiBuild(ceoGoal: string): boolean {
  const g = ceoGoal.toLowerCase();
  if (g.length < 80) return false;
  return (
    /\b(canvas|node[- ]?based|visual (flow|editor|graph)|workflow editor|diagram|whiteboard|infinite.?zoom|bezier|socket|palette|sidebar|properties panel|tool(bar| panel)|drag.?drop.?node|pixel.?flow|flow editor)\b/i.test(
      g,
    ) ||
    (/\b(editor|workspace|ide)\b/i.test(g) &&
      /\b(panel|sidebar|node|canvas|graph)\b/i.test(g))
  );
}

export function isUiShellTitle(title: string): boolean {
  return title === IMPLEMENT_UI_SHELL_TITLE || /^Implement UI shell\b/i.test(title);
}

export function isAppLogicTitle(title: string): boolean {
  return title === IMPLEMENT_APP_LOGIC_TITLE || /^Implement app logic\b/i.test(title);
}

export function isStagedImplementTitle(title: string): boolean {
  return isUiShellTitle(title) || isAppLogicTitle(title);
}

/**
 * Design guardrails for shipped static apps.
 * Preview CSP blocks CDN Tailwind — use local utilities.css (Tailwind-lite) instead.
 */
export const UI_DESIGN_BAR = `UI quality bar (non-negotiable for workspace / editor / node apps):
- Prefer a polished 3-pane chrome when the goal is an editor/workspace/flow tool: left tool/palette sidebar, main canvas/workspace, right properties/inspector panel (use class="app-shell" / "layout-3pane" from utilities.css).
- Do NOT ship a bare <canvas> with only circles/lines and no HTML chrome. Nodes, tools, and inspectors must be real HTML/CSS cards (class="node-card" with .node-header and .socket).
- REQUIRED: the main workspace MUST still include a real <canvas id="canvas"> (or <svg>) layer for grid/cables/pan-zoom — HTML cards alone are not enough when the CEO asked for a canvas.
- ALWAYS link utilities.css (local Tailwind-lite dark theme + layout utilities) before styles.css. Prefer utility classes (flex, gap-2, btn-primary, sidebar, panel). Put ONLY app-specific rules in styles.css — do not reinvent a full theme.
- Never use cdn.tailwindcss.com or any CDN — Preview CSP blocks it. utilities.css is the approved utility pack.
- Empty states: show class="empty-hint" with “add your first …” copy — not a blank black rectangle.
- Every primary control is a real button/input in the DOM, not only drawn on canvas.`;
