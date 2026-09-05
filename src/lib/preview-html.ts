import { injectBaseHref } from "./project-files";
import { injectPreviewShim } from "./preview-shim";

/** Convert a project-root absolute path (/styles.css) to a path relative to filePath. */
export function projectPathToRelative(absolutePath: string, filePath: string): string {
  const target = absolutePath.replace(/^\/+/, "");
  if (!target) return absolutePath;
  const fileDir = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : "";
  if (!fileDir) return target;

  const fromParts = fileDir.split("/").filter(Boolean);
  const toParts = target.split("/").filter(Boolean);
  let common = 0;
  while (
    common < fromParts.length &&
    common < toParts.length &&
    fromParts[common] === toParts[common]
  ) {
    common += 1;
  }
  const up = fromParts.length - common;
  const rel = [...Array(up).fill(".."), ...toParts.slice(common)].join("/");
  return rel || ".";
}

const HTML_ASSET_ATTR =
  /((?:\b(?:src|href)\s*=\s*["']))(\/(?!\/)[^"'?#]+)((?:["']))/gi;

/** Rewrite root-absolute asset URLs in HTML so they resolve under the injected <base>. */
export function rewriteRootAbsoluteAssetUrls(html: string, filePath: string): string {
  return html.replace(HTML_ASSET_ATTR, (match, prefix, path, suffix) => {
    const relative = projectPathToRelative(path, filePath);
    return `${prefix}${relative}${suffix}`;
  });
}

const CSS_URL = /url\(\s*(['"]?)(\/(?!\/)[^)'"]+)\1\s*\)/gi;

/** Rewrite root-absolute url() paths in CSS served through the preview host. */
export function rewriteCssRootAbsoluteUrls(css: string, cssFilePath: string): string {
  return css.replace(CSS_URL, (match, quote, path) => {
    const relative = projectPathToRelative(path, cssFilePath);
    return `url(${quote}${relative}${quote})`;
  });
}

/**
 * Full HTML preparation for the signed preview host:
 * rewrite paths → inject <base> → inject localStorage shim.
 */
export function preparePreviewHtml(
  html: string,
  runId: string,
  filePath: string,
  baseRoot: string,
): string {
  let out = rewriteRootAbsoluteAssetUrls(html, filePath);
  out = injectBaseHref(out, runId, filePath, baseRoot);
  out = injectPreviewShim(out);
  return out;
}

/** Rewrite asset bodies when served through the preview host (CSS url() paths). */
export function preparePreviewAsset(body: string, filePath: string, contentType: string): string {
  if (contentType.startsWith("text/css")) {
    return rewriteCssRootAbsoluteUrls(body, filePath);
  }
  return body;
}
