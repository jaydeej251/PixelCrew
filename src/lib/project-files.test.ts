import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assembleProject,
  findPreviewIndex,
  injectBaseHref,
  isPackagerFallbackHtml,
  isProjectPath,
  leftoverProse,
  normalizePath,
  parseFileFences,
  toFileFences,
} from "./project-files";

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

describe("leftoverProse", () => {
  it("strips fences so notes stay readable", () => {
    const text = `Shipping the UI.\n\n\`\`\`file:app.js\n1\n\`\`\``;
    const files = parseFileFences(text);
    assert.match(leftoverProse(text, files), /Shipping/);
    assert.doesNotMatch(leftoverProse(text, files), /file:app/);
  });
});
