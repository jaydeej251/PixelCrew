import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PIXEL_UTILITIES_CSS,
  UTILITIES_CSS_PATH,
  ensureHtmlLinksUtilitiesCss,
  utilitiesCssFile,
} from "./pixel-utilities-css";
import { scaffoldGaps } from "./project-files";

describe("pixel utilities css", () => {
  it("exposes a local dark utility pack (not a CDN)", () => {
    const file = utilitiesCssFile();
    assert.equal(file.path, UTILITIES_CSS_PATH);
    assert.match(PIXEL_UTILITIES_CSS, /layout-3pane|node-card|btn-primary|:root/);
    assert.doesNotMatch(PIXEL_UTILITIES_CSS, /cdn\.tailwindcss/);
  });

  it("scaffolds utilities.css when HTML exists but the pack is missing", () => {
    const gaps = scaffoldGaps({
      ceoGoal: "Build PixelFlow",
      artifacts: [
        {
          type: "code",
          title: "index.html",
          content:
            "<!doctype html><html><head><title>PixelFlow</title></head><body><h1>PixelFlow</h1></body></html>",
          filePath: "index.html",
        },
      ],
    });
    assert.ok(gaps.some((g) => g.path === UTILITIES_CSS_PATH));
  });

  it("injects a utilities.css link when HTML forgot it", () => {
    const html =
      "<!doctype html><html><head><title>X</title></head><body><h1>X</h1></body></html>";
    const out = ensureHtmlLinksUtilitiesCss(html);
    assert.match(out, /utilities\.css/);
  });
});
