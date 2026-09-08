import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  councilSystemPrompt,
  dispatcherSystemPrompt,
  engineerSystemPrompt,
  plannerSystemPrompt,
  qaFixSystemPrompt,
  synthesizerSystemPrompt,
  workerSystemPrompt,
} from "./prompts";
import { DEFAULT_TOKEN_BUDGET } from "./workflow";

const SHIP_MARKERS = ["addEventListener", 'type="module"', "javascript:void(0)"];

describe("stage-slim system prompts", () => {
  it("keeps the full ship bar on engineers", () => {
    const prompt = engineerSystemPrompt("Ada", "Engineer", "Build the static app");
    for (const marker of SHIP_MARKERS) {
      assert.match(prompt, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("does not put the full ship bar on council, synth, or planner", () => {
    const prompts = [
      councilSystemPrompt("Pat", "Product Manager", "project_manager"),
      synthesizerSystemPrompt("Avery"),
      plannerSystemPrompt("Avery", "Workspace AI"),
    ];
    for (const prompt of prompts) {
      for (const marker of SHIP_MARKERS) {
        assert.doesNotMatch(
          prompt,
          new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
          `unexpected ship marker ${marker}`,
        );
      }
    }
  });

  it("still tells synth/planner that v1 is static HTML/CSS/JS", () => {
    assert.match(synthesizerSystemPrompt("Avery"), /static HTML\/CSS\/JS/);
    assert.match(plannerSystemPrompt("Avery", "Workspace AI"), /static HTML\/CSS\/JS/);
  });

  it("tells dispatcher not to duplicate engineer when senior covers", () => {
    const prompt = dispatcherSystemPrompt("Avery");
    assert.match(prompt, /Respect the CEO's roster/);
    assert.match(prompt, /do NOT request frontend_engineer/);
  });

  it("uses engineer ship prompt when senior implements", () => {
    const prompt = workerSystemPrompt(
      "Sam",
      "Senior Developer",
      "Architecture",
      "tech_architect",
      "Implement product work from the plan",
    );
    assert.match(prompt, /addEventListener/);
    assert.doesNotMatch(prompt, /surgical QA fix/);
  });

  it("uses follow-up patch prompt for Apply requested changes", () => {
    const prompt = workerSystemPrompt(
      "Sam",
      "Senior Developer",
      "Architecture",
      "tech_architect",
      "Apply requested changes",
    );
    assert.match(prompt, /Request-changes patch/i);
    assert.match(prompt, /at least one complete/);
    assert.match(prompt, /UI refresh/i);
  });

  it("uses surgical qa-fix prompt for Fix QA punch list", () => {
    const viaWorker = workerSystemPrompt(
      "Sam",
      "Senior Developer",
      "Architecture",
      "tech_architect",
      "Fix QA punch list (round 1)",
    );
    const direct = qaFixSystemPrompt("Sam", "Senior Developer");
    assert.match(viaWorker, /surgical QA fix/);
    assert.match(viaWorker, /Do NOT re-emit unchanged files/);
    assert.match(direct, /Do NOT rebuild the whole app/);
    assert.match(direct, /MUST emit a complete working/);
    assert.match(direct, /UI shell ready/);
    assert.match(direct, /FORBIDDEN: architecture essays|Technical Brainstorm/i);
  });

  it("detects architecture brainstorms that waste QA-fix tokens", async () => {
    const { looksLikeArchitectureBrainstorm, qaFixRequiresFullAppJs, qaFixFullAppJsSystemPrompt } =
      await import("./prompts");
    assert.equal(
      looksLikeArchitectureBrainstorm(
        "PixelFlow – Senior-Dev Technical Brainstorm\n\n1. High-Level Stack\n| Layer | Tech | Why |",
      ),
      true,
    );
    assert.equal(
      looksLikeArchitectureBrainstorm("```file:app.js\nconsole.log(1);\n```"),
      false,
    );
    assert.equal(
      qaFixRequiresFullAppJs(
        "CRITICAL: shipped app.js is a UI-shell stub or missing. rewrite app.js fully",
      ),
      true,
    );
    assert.match(
      qaFixFullAppJsSystemPrompt("Sam", "Senior Developer"),
      /UI-shell stub/,
    );
  });

  it("keeps council-style worker prompt for senior review tasks", () => {
    const prompt = workerSystemPrompt(
      "Sam",
      "Senior Developer",
      "Architecture",
      "tech_architect",
      "Review published plan and delegate",
    );
    assert.doesNotMatch(prompt, /addEventListener/);
  });

  it("uses stricter follow-up QA prompt when Request-changes is in play", () => {
    const prompt = workerSystemPrompt(
      "Taylor",
      "QA Engineer",
      "Review",
      "qa_engineer",
      "QA review of shipped product",
      { followUpQa: true },
    );
    assert.match(prompt, /Prefer FAIL with a short punch list|honest \[MISSING\]/i);
    assert.doesNotMatch(prompt, /Prefer PASS with nits/);
  });

  it("mentions Preview and ZIP working controls in ship bar", () => {
    assert.match(engineerSystemPrompt("Ada", "Engineer", "Build"), /Preview and after ZIP/);
  });

  it("QA prompt requires cross-file evidence and bans false localStorage FAILs", async () => {
    const { qaSystemPrompt } = await import("./prompts");
    const prompt = qaSystemPrompt("Taylor", "QA Engineer", "Review shipped files");
    assert.match(prompt, /Search HTML, CSS, and JS/);
    assert.match(prompt, /not “not evidenced in app\.js”/);
    assert.match(prompt, /Do NOT FAIL for “overwrite instead of append”/);
    assert.match(prompt, /Theme\/aesthetic gaps/);
    assert.match(prompt, /Prefer PASS with nits/);
    assert.doesNotMatch(prompt, /localStorage that overwrites a requested collection instead of appending/);
  });
});

describe("token budget safeguard", () => {
  it("hard gate aliases DEFAULT_TOKEN_BUDGET at 256k", () => {
    assert.equal(DEFAULT_TOKEN_BUDGET, 256_000);
  });
});
