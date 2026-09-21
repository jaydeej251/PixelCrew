/**
 * Detect UI-shell / placeholder app.js so QA-fix can force a full rewrite
 * and merge can refuse to wipe a working script with a stub.
 *
 * Important: the official shell stub uses addEventListener("DOMContentLoaded", …).
 * Counting any addEventListener as "real" made padded stubs skip escalation.
 */

const LIFECYCLE_LISTENER =
  /(?:window|document|)\s*\.?\s*addEventListener\s*\(\s*['"](?:DOMContentLoaded|load|unload|beforeunload|pagehide|pageshow)['"]/gi;

export function countInteractiveListeners(js: string): number {
  const withoutLifecycle = js.replace(LIFECYCLE_LISTENER, "/* lifecycle */");
  const addEv = withoutLifecycle.match(
    /\.addEventListener\s*\(\s*['"][^'"]+['"]/g,
  );
  const onProp = withoutLifecycle.match(
    /\.on(?:click|mousedown|mouseup|mousemove|mouseleave|mouseenter|keydown|keyup|submit|input|change|pointerdown|pointermove|pointerup|touchstart|touchmove|touchend)\s*=/gi,
  );
  return (addEv?.length ?? 0) + (onProp?.length ?? 0);
}

/** True when app.js is still a UI-shell placeholder (or empty), not product logic. */
export function isShellStubAppJs(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return true;
  if (trimmed.length < 120) return true;

  const interactive = countInteractiveListeners(trimmed);

  // Canonical shell stub, even when padded with comments / blank lines.
  if (/UI shell ready/i.test(trimmed) && interactive === 0) return true;

  // Short script with no interactive handlers — still a stub/near-stub.
  if (trimmed.length < 800 && interactive === 0) return true;

  // Only lifecycle wiring + a console.log (common "I touched app.js" fake).
  if (
    interactive === 0 &&
    /console\.log\s*\(/i.test(trimmed) &&
    trimmed.length < 1_200
  ) {
    return true;
  }

  return false;
}
