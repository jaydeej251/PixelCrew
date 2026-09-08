import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASK_CONFIRMATION_TITLE,
  extractAskItems,
  extractFollowUpChangeItems,
  parseAskConfirmationChecklist,
  summarizeBuilt,
  summarizeFilesUpdated,
  summarizePrompt,
} from "./run-completion-summary";
import {
  CHANGES_I_WANT_MARKER,
  REQUEST_CHANGES_FILES_TITLE,
} from "./follow-up-goal";

describe("run completion summaries", () => {
  it("summarizes a plain CEO prompt", () => {
    const s = summarizePrompt(
      "Build a static retro RPG task app called TaskQuest with quests and XP.",
    );
    assert.equal(s.isFollowUp, false);
    assert.match(s.headline, /TaskQuest/);
    assert.match(s.body, /quests and XP/);
  });

  it("keeps follow-up changes separate from the base brief", () => {
    const s = summarizePrompt(
      "Build TaskQuest\n\nChanges I want:\nFix the inventory drawer",
    );
    assert.equal(s.isFollowUp, true);
    assert.match(s.body, /TaskQuest/);
    assert.match(s.changes, /inventory drawer/);
  });

  it("extracts bullet features from a TaskQuest-style brief", () => {
    const goal = `Build "TaskQuest"
Core Mechanics & Features:
- Player Stats Dashboard with XP and gold
- Quest Creation (Tasks) with difficulty ratings
- Inventory drawer for purchased items
- Data Persistence: Store stats in localStorage
- Aesthetics: cozy fantasy/pixel-art UI theme`;
    const items = extractAskItems(goal);
    assert.ok(items.some((i) => /TaskQuest/i.test(i)));
    assert.ok(items.some((i) => /Player Stats|XP|gold/i.test(i)));
    assert.ok(items.some((i) => /Inventory/i.test(i)));
    assert.ok(items.some((i) => /localStorage|Persistence/i.test(i)));
  });

  it("splits Request-changes prose into real checklist asks (not one dump)", () => {
    const changes =
      "seems like there is a bug i cant move the task i created from backlog to in quest to completed. also if possible overhaul the ui";
    const items = extractFollowUpChangeItems(changes);
    assert.ok(items.length >= 2);
    assert.ok(items.some((i) => /Move|column|backlog/i.test(i)));
    assert.ok(items.some((i) => /UI overhaul/i.test(i)));
    assert.ok(items.every((i) => i.length < 120));
  });

  it("does not mark follow-up column-move as met just because TaskQuest exists", () => {
    const goal = `Build "TaskQuest"${CHANGES_I_WANT_MARKER}cant move task from backlog to completed. also overhaul the ui`;
    const s = summarizeBuilt(
      [
        {
          type: "code",
          title: "index.html",
          content:
            "<!doctype html><html><head><title>TaskQuest</title></head><body><div class='backlog'>Quest</div></body></html>",
          filePath: "index.html",
        },
        {
          type: "code",
          title: "app.js",
          content: "const tasks=[]; localStorage.setItem('x', '1');",
          filePath: "app.js",
        },
      ],
      goal,
    );
    assert.match(s.headline, /your changes/i);
    assert.ok(s.items.some((i) => /Move|column/i.test(i.label) && i.status === "missing"));
    // No Request-changes files artifact → UI must not auto-✓ from CSS vibes
    assert.ok(s.items.some((i) => /UI overhaul/i.test(i.label) && i.status === "missing"));
    assert.ok(s.items.every((i) => !/cant move the task i created/i.test(i.label)));
    assert.equal(s.confirmedByQa, false);
  });

  it("reports files updated from the latest Request-changes artifact", () => {
    const s = summarizeFilesUpdated([
      {
        type: "other",
        title: REQUEST_CHANGES_FILES_TITLE,
        content: JSON.stringify({ paths: ["styles.css", "app.js"], at: "2026-01-01" }),
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    assert.equal(s.empty, false);
    assert.deepEqual(s.paths, ["styles.css", "app.js"]);
  });

  it("does not mark UI overhaul confirmed from CSS vibes alone", () => {
    const goal = `Build "TaskQuest"${CHANGES_I_WANT_MARKER}overhaul the ui`;
    const s = summarizeBuilt(
      [
        {
          type: "code",
          title: "styles.css",
          content: ":root { --a: #111; --b: #222; --c: #333; --d: #444; } body { border-radius: 16px; }",
          filePath: "styles.css",
        },
        {
          type: "other",
          title: REQUEST_CHANGES_FILES_TITLE,
          content: JSON.stringify({ paths: ["styles.css"], at: "2026-01-02" }),
          createdAt: "2026-01-02T00:00:00.000Z",
        },
      ],
      goal,
    );
    assert.ok(s.items.some((i) => /UI overhaul/i.test(i.label) && i.status === "missing"));
    assert.equal(s.confirmedByQa, false);
  });

  it("prefers QA MET/MISSING confirmation over keyword guesses", () => {
    const goal = `Build PixelFlow${CHANGES_I_WANT_MARKER}Execution Cycle Visualizer pulse\nalso Loop Detection`;
    const s = summarizeBuilt(
      [
        {
          type: "code",
          title: "app.js",
          content: "function loopDetect(){} function exportJs(){}",
          filePath: "app.js",
        },
        {
          type: "other",
          title: ASK_CONFIRMATION_TITLE,
          content: JSON.stringify({
            items: [
              { label: "Execution Cycle Visualizer", status: "missing" },
              { label: "Loop Detection", status: "met" },
            ],
          }),
          createdAt: "2026-01-03T00:00:00.000Z",
        },
      ],
      goal,
    );
    assert.equal(s.confirmedByQa, true);
    assert.ok(
      s.items.some((i) => /Execution Cycle/i.test(i.label) && i.status === "missing"),
    );
    assert.ok(s.items.some((i) => /Loop Detection/i.test(i.label) && i.status === "met"));
  });

  it("parses QA checklist lines from review output", () => {
    const items = parseAskConfirmationChecklist(
      "Verdict: FAIL\n\n- [MET] Loop Detection — topoSort()\n- [MISSING] Execution Cycle Visualizer — no pulse animation\n",
    );
    assert.equal(items.length, 2);
    assert.equal(items[0]!.status, "met");
    assert.equal(items[1]!.status, "missing");
  });

  it("builds an ask-vs-built checklist without listing file paths", () => {
    const goal = `Build "TaskQuest"
- Inventory drawer for purchased items
- Store progression in localStorage
- Quest list with difficulty ratings`;
    const s = summarizeBuilt(
      [
        {
          type: "code",
          title: "index.html",
          content:
            "<!doctype html><html><head><title>TaskQuest</title></head><body><div id='inventory'>Inventory</div><div class='quest'>Quest</div></body></html>",
          filePath: "index.html",
        },
        {
          type: "code",
          title: "app.js",
          content: "localStorage.setItem('taskquest', JSON.stringify({gold:1}));",
          filePath: "app.js",
        },
      ],
      goal,
    );
    assert.equal(s.headline, "TaskQuest");
    assert.ok(s.items.length >= 3);
    assert.ok(s.items.every((i) => !/\.html|\.js|Entry:|project files/i.test(i.label)));
    assert.ok(s.items.some((i) => /Inventory/i.test(i.label) && i.status === "met"));
    assert.ok(s.items.some((i) => /localStorage/i.test(i.label) && i.status === "met"));
  });

  it("marks missing asks when the shipped app lacks evidence", () => {
    const goal = `Build "TaskQuest"\n- Kanban board with swimlanes\n- Voice chat lobby`;
    const s = summarizeBuilt(
      [
        {
          type: "code",
          title: "index.html",
          content:
            "<!doctype html><html><head><title>TaskQuest</title></head><body><h1>TaskQuest</h1></body></html>",
          filePath: "index.html",
        },
      ],
      goal,
    );
    assert.ok(s.items.some((i) => /Kanban|swimlanes/i.test(i.label) && i.status === "missing"));
    assert.ok(s.items.some((i) => /Voice chat/i.test(i.label) && i.status === "missing"));
  });
});
