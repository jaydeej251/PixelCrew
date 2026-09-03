import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evalPlanQuality, formatPlanReport } from "./plan-quality";

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
});
