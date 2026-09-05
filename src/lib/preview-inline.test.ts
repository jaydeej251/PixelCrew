import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inlineLinkedProjectAssets } from "./preview-inline";

describe("inlineLinkedProjectAssets", () => {
  it("inlines stylesheets and module scripts for opaque-origin preview", () => {
    const files = new Map([
      [
        "index.html",
        `<html><head><link rel="stylesheet" href="styles.css"></head>
         <body><script type="module" src="app.js"></script></body></html>`,
      ],
      ["styles.css", ".x { display: block; }"],
      ["app.js", "document.body.classList.add('ready');"],
    ]);
    const out = inlineLinkedProjectAssets(files.get("index.html")!, "index.html", files);
    assert.match(out, /<style data-inlined-from="styles\.css">/);
    assert.match(out, /classList\.add\('ready'\)/);
    assert.doesNotMatch(out, /src="app\.js"/);
  });
});
