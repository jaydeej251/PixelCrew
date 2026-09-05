import { normalizePath } from "./project-files";

export function resolveProjectAssetPath(fromFile: string, ref: string): string | null {
  const trimmed = ref.trim().split(/[?#]/)[0] ?? "";
  if (
    !trimmed ||
    trimmed.startsWith("http:") ||
    trimmed.startsWith("https:") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("javascript:")
  ) {
    return null;
  }
  if (trimmed.startsWith("/")) {
    return normalizePath(trimmed.slice(1));
  }
  const dir = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/")) : "";
  const combined = dir ? `${dir}/${trimmed}` : trimmed;
  return normalizePath(combined);
}

/**
 * Replace linked stylesheets and external scripts with inlined bodies.
 * Preview pages use a CSP sandbox without allow-same-origin (opaque origin), so
 * cross-origin script fetches — including same-host module scripts — fail CORS.
 */
export function inlineLinkedProjectAssets(
  html: string,
  filePath: string,
  files: Map<string, string>,
): string {
  let out = html;

  out = out.replace(
    /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi,
    (match, href: string) => {
      if (!/\brel\s*=\s*["'][^"']*stylesheet/i.test(match)) return match;
      const resolved = resolveProjectAssetPath(filePath, href);
      if (!resolved || !files.has(resolved)) return match;
      const css = files.get(resolved)!;
      return `<style data-inlined-from="${resolved}">\n${css}\n</style>`;
    },
  );

  out = out.replace(
    /<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
    (_match, before: string, src: string) => {
      const resolved = resolveProjectAssetPath(filePath, src);
      if (!resolved || !files.has(resolved)) return _match;
      const js = files.get(resolved)!;
      return `<script${before} data-inlined-from="${resolved}">\n${js}\n</script>`;
    },
  );

  return out;
}
