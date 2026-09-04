import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evalPlanQuality, formatPlanReport } from "./plan-quality";
import { synthesizerSystemPrompt } from "./prompts";

const GOOD_PLAN = `# Goal
A personal portfolio for Maya Cruz, junior MERN developer.

# Stack
Static HTML + CSS + JS. Contact messages in localStorage.

# UX
Hero, 3 projects, contact form. Email Me jumps to #contact.

# Features
Working contact form, specific project copy.

# Out of scope
No Mongo, no Heroku, no reCAPTCHA.

# Task list
- Product Manager: audience, success, real copy for 3 projects.
- UI/UX Designer: type, color tokens, layout, empty/confirmation states.
- Senior Developer: file list (index.html, styles.css, script.js) and localStorage array shape.
- Engineer: build and test the whole static set in one session.
`;

const AGENCY_PLAN = `# Goal
Portfolio landing page.

# Stack
HTML, CSS, JS, localStorage.

# Timeline
Day 1: Kickoff
Day 2: Hero
Day 3: Projects
Day 4: Contact
Day 5: Footer
Day 6: QA
Day 7: Launch

# Task list
- Product Manager: Build Hero Section in HTML
- Tech Architect: test CSS for the footer
- Senior Developer snippet: localStorage.setItem('contactMessage', JSON.stringify(payload))
- CTA: href="javascript:void(0);" onclick="openForm()"
`;

describe("evalPlanQuality", () => {
  it("passes a scope-matched static plan with role-correct tasks", () => {
    const report = evalPlanQuality(GOOD_PLAN);
    assert.equal(report.passed, true, formatPlanReport(report));
  });

  it("fails the inflated 7-day agency plan from the review", () => {
    const report = evalPlanQuality(AGENCY_PLAN);
    assert.equal(report.passed, false);
    assert.match(formatPlanReport(report), /FAIL/);
    assert.ok(report.issues.some((i) => /timeline/i.test(i.message)));
    assert.ok(report.issues.some((i) => /product/i.test(i.message)));
    assert.ok(report.issues.some((i) => /localStorage/i.test(i.message)));
    assert.ok(report.issues.some((i) => /inline js/i.test(i.message)));
  });

  it("fails when a named product goal is merged into a portfolio plan", () => {
    const goal = `Build **VibeLog**, a mood tracking SPA with Check-in, History,
Insights, a burnout risk gauge, and localStorage. Do not build a portfolio,
marketing landing page, Contact / Privacy footer.`;
    const drifted = `# Goal
Build a complete static website portfolio for the CEO.

# Stack
Static HTML + CSS + JS and localStorage.

# UX
Hero, Projects, About, Contact form, and social footer.

# Features
Project cards and a working contact form.

# Out of scope
No backend.

# Task list
- Product Manager: define audience and copy.
- UI/UX Designer: define tokens and layouts.
- Senior Developer: define file shape.
- Engineer: build index.html, styles.css, and app.js.`;

    const report = evalPlanQuality(drifted, { ceoGoal: goal });
    assert.equal(report.passed, false);
    assert.ok(report.issues.some((issue) => /dropped the CEO product/i.test(issue.message)));
    assert.ok(report.issues.some((issue) => /portfolio/i.test(issue.message)));
    assert.ok(report.issues.some((issue) => /explicit CEO bans/i.test(issue.message)));
  });

  it("allows a matching plan to preserve the CEO's negative requirements", () => {
    const goal =
      "Build **VibeLog**, a mood tracking SPA. Do not build a portfolio or add a Contact / Privacy footer.";
    const plan = `# Goal
Build VibeLog as a mood tracking SPA.

# Stack
Static HTML + CSS + JS with localStorage.

# UX
Check-in, History, and Insights tabs with a live risk gauge.

# Features
Mood and energy sliders, history filtering, export, and a seven-day chart.

# Out of scope
Do not build a portfolio or add a Contact / Privacy footer.

# Task list
- Product Manager: define success criteria.
- UI/UX Designer: define tokens and responsive states.
- Senior Developer: define file and persistence shape.
- Engineer: build and test the static files.`;

    const report = evalPlanQuality(plan, { ceoGoal: goal });
    assert.equal(report.passed, true, formatPlanReport(report));
  });

  it("keeps the synthesizer generic instead of forcing portfolio output", () => {
    const prompt = synthesizerSystemPrompt("Avery");
    assert.doesNotMatch(prompt, /still ship a complete, specific portfolio/i);
    assert.match(prompt, /CEO goal is the source of truth/i);
    assert.match(prompt, /Never turn an app into a portfolio/i);
  });
});
