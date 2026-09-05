import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  preparePreviewAsset,
  preparePreviewHtml,
  projectPathToRelative,
  rewriteCssRootAbsoluteUrls,
  rewriteRootAbsoluteAssetUrls,
} from "./preview-html";
import { injectPreviewShim } from "./preview-shim";

describe("projectPathToRelative", () => {
  it("maps root-absolute paths from index.html", () => {
    assert.equal(projectPathToRelative("/styles.css", "index.html"), "styles.css");
    assert.equal(projectPathToRelative("/js/app.js", "index.html"), "js/app.js");
  });

  it("maps root-absolute paths from nested html", () => {
    assert.equal(projectPathToRelative("/styles.css", "app/index.html"), "../styles.css");
    assert.equal(projectPathToRelative("/assets/logo.png", "app/pages/index.html"), "../../assets/logo.png");
  });
});

describe("rewriteRootAbsoluteAssetUrls", () => {
  it("rewrites src and href attributes", () => {
    const html = `<link rel="stylesheet" href="/styles.css"><script src="/app.js"></script>`;
    const out = rewriteRootAbsoluteAssetUrls(html, "index.html");
    assert.match(out, /href="styles\.css"/);
    assert.match(out, /src="app\.js"/);
  });
});

describe("rewriteCssRootAbsoluteUrls", () => {
  it("rewrites url() paths in css", () => {
    const css = `body { background: url(/images/bg.png); }`;
    const out = rewriteCssRootAbsoluteUrls(css, "styles.css");
    assert.match(out, /url\("images\/bg\.png"\)|url\(images\/bg\.png\)/);
  });
});

describe("preparePreviewHtml", () => {
  it("injects base href, shim, and rewrites absolute assets", () => {
    const html = `<!DOCTYPE html><html><head><title>Calc</title></head>
      <body><link href="/styles.css" rel="stylesheet"><script src="/app.js"></script></body></html>`;
    const out = preparePreviewHtml(html, "run1", "index.html", "/api/previews/tok/");
    assert.match(out, /<base href="\/api\/previews\/tok\/">/);
    assert.match(out, /href="styles\.css"/);
    assert.match(out, /src="app\.js"/);
    assert.match(out, /<script>[\s\S]*localStorage[\s\S]*<\/script>/);
    assert.match(out, /makeStore/);
  });
});

describe("preparePreviewAsset", () => {
  it("rewrites css but leaves js unchanged", () => {
    const css = preparePreviewAsset("a { background: url(/x.png); }", "styles.css", "text/css; charset=utf-8");
    assert.match(css, /url\(/);
    assert.doesNotMatch(css, /url\(\/x\.png\)/);
    const js = preparePreviewAsset("console.log(1)", "app.js", "text/javascript; charset=utf-8");
    assert.equal(js, "console.log(1)");
  });
});

describe("injectPreviewShim", () => {
  it("inserts shim once at the top of head", () => {
    const html = injectPreviewShim("<html><head><title>x</title></head></html>");
    assert.equal(html.match(/<script>/g)?.length, 1);
    assert.match(html, /<head[^>]*>\s*<script>/);
  });
});
