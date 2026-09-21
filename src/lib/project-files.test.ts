import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assembleProject,
  assembleSingleFileHtml,
  findPreviewIndex,
  injectBaseHref,
  isPackagerFallbackHtml,
  isProjectPath,
  leftoverProse,
  mergeProjectFiles,
  normalizePath,
  parseFileFences,
  toFileFences,
} from "./project-files";
import { evalShippedProject, formatShipReport } from "./ship-quality";

describe("parseFileFences", () => {
  it("reads file: fences and skips language-only json", () => {
    const text = `
Brief note.

\`\`\`json
{"needed":["engineer"]}
\`\`\`

\`\`\`file:index.html
<h1>Hi</h1>
\`\`\`

\`\`\`js app.js
console.log(1)
\`\`\`
`;
    const files = parseFileFences(text);
    assert.deepEqual(
      files.map((f) => f.path),
      ["index.html", "app.js"],
    );
    assert.match(files[0]!.content, /<h1>Hi<\/h1>/);
  });

  it("rejects path traversal and env files", () => {
    assert.equal(normalizePath("../secret"), null);
    assert.equal(normalizePath(".env.local"), null);
    assert.equal(normalizePath("src/app.js"), "src/app.js");
    assert.equal(isProjectPath("engineer/clxyz.md"), false);
    assert.equal(isProjectPath("index.html"), true);
  });

  it("round-trips toFileFences", () => {
    const raw = toFileFences({ "styles.css": "body{}\n" });
    const parsed = parseFileFences(raw);
    assert.equal(parsed[0]?.path, "styles.css");
    assert.match(parsed[0]!.content, /body\{\}/);
  });

  it("merges rewrite fences onto the first emit so missing assets can recover", async () => {
    const { MOCK_BUDGET_TRACKER } = await import("./mock-project");
    const all = Object.entries(MOCK_BUDGET_TRACKER).map(([path, content]) => ({
      path,
      content,
    }));
    const first = all.filter((f) => f.path === "index.html");
    const rewrite = all.filter((f) => f.path === "styles.css" || f.path === "app.js");
    // Linked-but-missing CSS/JS are stubbed during eval so HTML-only can pass the asset gate.
    assert.equal(
      evalShippedProject(first, { ceoGoal: "personal budget tracker" }).passed,
      true,
      formatShipReport(evalShippedProject(first, { ceoGoal: "personal budget tracker" })),
    );
    const merged = mergeProjectFiles(first, rewrite);
    assert.ok(merged.some((f) => f.path === "index.html"));
    assert.ok(merged.some((f) => f.path === "styles.css"));
    assert.ok(merged.some((f) => f.path === "app.js"));
    // Partial rewrite alone still fails (no HTML); merged set is what orchestrator must eval.
    assert.equal(
      evalShippedProject(rewrite, { ceoGoal: "personal budget tracker" }).passed,
      false,
    );
    const after = evalShippedProject(merged, { ceoGoal: "personal budget tracker" });
    assert.equal(after.passed, true, formatShipReport(after));
  });

  it("does not let a thin rewrite wipe a contentful index.html", async () => {
    const { MOCK_BUDGET_TRACKER } = await import("./mock-project");
    const rich = {
      path: "index.html",
      content: MOCK_BUDGET_TRACKER["index.html"]!,
    };
    const stub = {
      path: "index.html",
      content: "<!doctype html><html><body><h1>App</h1></body></html>",
    };
    const css = {
      path: "styles.css",
      content: MOCK_BUDGET_TRACKER["styles.css"]!,
    };
    const merged = mergeProjectFiles([rich], [stub, css]);
    assert.equal(merged.find((f) => f.path === "index.html")?.content, rich.content);
    assert.ok(merged.some((f) => f.path === "styles.css"));
  });

  it("does not let a shell stub wipe a working app.js", () => {
    const rich = {
      path: "app.js",
      content: `
        const nodes = [];
        document.getElementById("add-node").addEventListener("click", () => {
          nodes.push({ id: crypto.randomUUID(), x: 40, y: 40 });
          render();
        });
        function render() {
          /* drag nodes, draw cables, pan/zoom */
          for (const n of nodes) console.log(n.id);
        }
        `.repeat(3),
    };
    const stub = {
      path: "app.js",
      content: `document.addEventListener("DOMContentLoaded", () => {
  console.log("UI shell ready");
});
`,
    };
    const merged = mergeProjectFiles([rich], [stub]);
    assert.equal(merged.find((f) => f.path === "app.js")?.content, rich.content);
  });

  it("parses the mock budget tracker as a drop-in app", async () => {
    const { MOCK_BUDGET_TRACKER } = await import("./mock-project");
    const files = parseFileFences(toFileFences(MOCK_BUDGET_TRACKER));
    const names = files.map((f) => f.path).sort();
    assert.deepEqual(names, ["README.md", "app.js", "index.html", "package.json", "styles.css"]);
    assert.match(files.find((f) => f.path === "app.js")!.content, /localStorage/);
  });

  it("mockProjectForGoal titles PulseBoard instead of Budget Tracker", async () => {
    const { mockProjectForGoal } = await import("./mock-project");
    const pulse = mockProjectForGoal("PulseBoard analytics");
    assert.match(pulse["index.html"] ?? "", /PulseBoard analytics/);
    assert.doesNotMatch(pulse["index.html"] ?? "", /Budget Tracker/);
    assert.doesNotMatch(pulse["index.html"] ?? "", /Welcome to PixelCrew/);
    assert.doesNotMatch(pulse["index.html"] ?? "", /ColorVision/);
    assert.doesNotMatch(pulse["index.html"] ?? "", /NeuralArt/);
    assert.doesNotMatch(pulse["index.html"] ?? "", /PixelCrew Projects/);
    const budget = mockProjectForGoal("personal budget tracker");
    assert.match(budget["index.html"] ?? "", /Budget Tracker/);
  });
});

describe("assembleProject", () => {
  it("puts dumps in docs and fills a drop-in zip", () => {
    const files = assembleProject({
      ceoGoal: "budget tracker",
      artifacts: [
        {
          type: "prd",
          title: "Merge the council plan",
          content: "Goal: track spend",
          filePath: "dispatcher/abc.md",
        },
        {
          type: "code",
          title: "index.html",
          content: "<html>app</html>",
          filePath: "index.html",
        },
      ],
    });
    assert.equal(files.get("index.html"), "<html>app</html>");
    assert.match(files.get("docs/merge-the-council-plan.md") ?? "", /track spend/);
    assert.match(files.get("package.json") ?? "", /pixelcrew-export/);
    assert.match(files.get("README.md") ?? "", /npx --yes serve/);
    assert.match(files.get("README.md") ?? "", /file:\/\/\`/);
  });

  it("adds a missing-build page when engineers shipped a Node app", () => {
    const files = assembleProject({
      ceoGoal: "habit app",
      artifacts: [
        {
          type: "code",
          title: "page",
          content: "export default function Page() {}",
          filePath: "src/app/page.tsx",
        },
        {
          type: "code",
          title: "pkg",
          content: `{"name":"habit","scripts":{"dev":"next dev"}}`,
          filePath: "package.json",
        },
      ],
    });
    const index = files.get("index.html") ?? "";
    assert.match(index, /No previewable app in this run/);
    assert.match(index, /data-pixelcrew-missing-build="1"/);
    assert.doesNotMatch(index, /<title>PixelCrew export<\/title>/);
    assert.equal(isPackagerFallbackHtml(index), true);
    assert.equal(files.get("package.json")?.includes("next dev"), true);
  });

  it("keeps a real index.html from engineers", async () => {
    const { MOCK_BUDGET_TRACKER } = await import("./mock-project");
    const artifacts = Object.entries(MOCK_BUDGET_TRACKER).map(([filePath, content]) => ({
      type: "code",
      title: filePath,
      content,
      filePath,
    }));
    const files = assembleProject({ ceoGoal: "budget tracker", artifacts });
    assert.match(files.get("index.html") ?? "", /Budget Tracker/);
    assert.doesNotMatch(files.get("index.html") ?? "", /No previewable app in this run/);
    assert.doesNotMatch(files.get("index.html") ?? "", /This export is a project folder/);
    assert.equal(isPackagerFallbackHtml(files.get("index.html")!), false);
  });

  it("prefers a PulseBoard index.html over a stale packager PixelCrew stub", () => {
    const files = assembleProject({
      ceoGoal: "PulseBoard analytics dashboard",
      artifacts: [
        {
          type: "code",
          title: "index.html",
          content: `<!DOCTYPE html><html><head><title>PixelCrew export</title></head><body><h1>This export is a project folder</h1></body></html>`,
          filePath: "index.html",
        },
        {
          type: "code",
          title: "PulseBoard",
          content: `<!DOCTYPE html><html><head><title>PulseBoard</title></head><body><h1>PulseBoard</h1><p>Live metrics</p></body></html>`,
          filePath: "app/index.html",
        },
      ],
    });
    assert.equal(findPreviewIndex(files), "app/index.html");
    assert.match(files.get("app/index.html") ?? "", /PulseBoard/);
    assert.equal(files.has("index.html"), false);
  });

  it("empty run preview is a missing-build error, not an unrelated product page", () => {
    const files = assembleProject({
      ceoGoal: "PulseBoard",
      artifacts: [
        {
          type: "prd",
          title: "Plan",
          content: "brainstorm only",
          filePath: "dispatcher/plan.md",
        },
      ],
    });
    const index = files.get("index.html") ?? "";
    assert.equal(findPreviewIndex(files, "PulseBoard"), "index.html");
    assert.match(index, /No previewable app in this run/);
    assert.match(index, /Missing build/);
    assert.match(index, /PulseBoard/);
    assert.doesNotMatch(index, /Budget Tracker/);
    assert.doesNotMatch(index, /Welcome to PixelCrew/);
    assert.doesNotMatch(index, /ColorVision/);
    assert.doesNotMatch(index, /NeuralArt/);
    assert.doesNotMatch(index, /PixelCrew Projects/);
    assert.doesNotMatch(index, /<title>PixelCrew export<\/title>/);
    assert.equal(isPackagerFallbackHtml(index), true);
  });

  it("quarantines a PixelCrew portfolio when the goal was PulseBoard", () => {
    const files = assembleProject({
      ceoGoal: "PulseBoard analytics",
      artifacts: [
        {
          type: "code",
          title: "index.html",
          content: `<!DOCTYPE html><html><head><title>PixelCrew Projects</title></head>
            <body><h1>PixelCrew</h1><p>Welcome to PixelCrew</p>
            <section id="projects"><h3>ColorVision</h3><h3>NeuralArt</h3></section>
            </body></html>`,
          filePath: "index.html",
        },
      ],
    });
    const index = files.get("index.html") ?? "";
    assert.match(index, /Missing build/);
    assert.match(index, /data-pixelcrew-missing-build="1"/);
    assert.doesNotMatch(index, /Welcome to PixelCrew/);
    assert.doesNotMatch(index, /ColorVision/);
    assert.doesNotMatch(index, /NeuralArt/);
  });

  it("preview picks a real app.html when no index.html was shipped", () => {
    const files = assembleProject({
      ceoGoal: "PulseBoard",
      artifacts: [
        {
          type: "code",
          title: "app",
          content: `<!DOCTYPE html><html><head><title>PulseBoard</title></head><body><h1>PulseBoard</h1></body></html>`,
          filePath: "pulseboard.html",
        },
      ],
    });
    assert.equal(findPreviewIndex(files), "pulseboard.html");
    assert.match(files.get("pulseboard.html") ?? "", /PulseBoard/);
    assert.equal(files.has("index.html"), false);
  });
});

describe("injectBaseHref", () => {
  it("inserts a preview base tag once", () => {
    const html = injectBaseHref("<html><head><title>x</title></head></html>", "run1");
    assert.match(html, /<base href="\/api\/runs\/run1\/preview\/">/);
    const again = injectBaseHref(html, "run1");
    assert.equal(again.match(/<base /g)?.length, 1);
  });
});

describe("assembleSingleFileHtml", () => {
  it("inlines linked css and js into one html file", () => {
    const files = assembleProject({
      ceoGoal: "calculator",
      artifacts: [
        {
          type: "code",
          title: "index",
          content: `<!DOCTYPE html><html><head><link rel="stylesheet" href="styles.css"></head>
            <body><button id="x">1</button><script src="app.js"></script></body></html>`,
          filePath: "index.html",
        },
        {
          type: "code",
          title: "styles",
          content: "button { color: red; }",
          filePath: "styles.css",
        },
        {
          type: "code",
          title: "app",
          content: "document.getElementById('x').addEventListener('click', () => {});",
          filePath: "app.js",
        },
      ],
    });
    const single = assembleSingleFileHtml(files, "calculator");
    assert.ok(single);
    assert.match(single!, /<style data-inlined-from="styles\.css">[\s\S]*color: red/);
    assert.match(single!, /<script[\s\S]*addEventListener/);
    assert.doesNotMatch(single!, /href="styles\.css"/);
    assert.doesNotMatch(single!, /src="app\.js"/);
  });
});

describe("leftoverProse", () => {
  it("strips fences so notes stay readable", () => {
    const text = `Shipping the UI.\n\n\`\`\`file:app.js\n1\n\`\`\``;
    const files = parseFileFences(text);
    assert.match(leftoverProse(text, files), /Shipping/);
    assert.doesNotMatch(leftoverProse(text, files), /file:app/);
  });
});
