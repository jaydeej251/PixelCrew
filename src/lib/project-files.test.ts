import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assembleProject,
  injectBaseHref,
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

  it("adds a fallback index.html when engineers shipped a Node app", () => {
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
    assert.match(files.get("index.html") ?? "", /npm install/);
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
    assert.doesNotMatch(files.get("index.html") ?? "", /This export is a project folder/);
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
