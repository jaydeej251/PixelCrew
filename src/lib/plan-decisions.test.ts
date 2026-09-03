import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyAnswer,
  allDecisionsAnswered,
  parsePlanDecisions,
  picksDifferFromRecommended,
  stripDecisionFence,
  withRecommendedAnswers,
} from "./plan-decisions";

const SAMPLE = `# Goal
Portfolio for Maya Cruz.

\`\`\`json
{"needed":["engineer"]}
\`\`\`

\`\`\`json
{
  "decisions": [
    {
      "id": "audience",
      "prompt": "Who is the site mainly for?",
      "why": "Copy, projects, and the CTA change with the reader.",
      "options": [
        {"id": "recruiters", "label": "Hiring managers", "recommended": true},
        {"id": "clients", "label": "Freelance clients"}
      ]
    },
    {
      "id": "stack",
      "prompt": "Should we use React or HTML/CSS?",
      "why": "Stack choice.",
      "options": [
        {"id": "html", "label": "Static HTML", "recommended": true},
        {"id": "react", "label": "React"}
      ]
    }
  ]
}
\`\`\`
`;

describe("parsePlanDecisions", () => {
  it("reads directional forks and ignores staffing json plus stack quizzes", () => {
    const items = parsePlanDecisions(SAMPLE);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.id, "audience");
    assert.equal(items[0]?.options[0]?.recommended, true);
    assert.equal(allDecisionsAnswered(items), false);
  });

  it("strips only the decisions fence from the plan markdown", () => {
    const plan = stripDecisionFence(SAMPLE);
    assert.match(plan, /Portfolio for Maya Cruz/);
    assert.doesNotMatch(plan, /Hiring managers/);
    assert.match(plan, /needed/);
  });

  it("applies recommended defaults and detects a fork from them", () => {
    const items = withRecommendedAnswers(parsePlanDecisions(SAMPLE));
    assert.equal(allDecisionsAnswered(items), true);
    assert.equal(picksDifferFromRecommended(items), false);
    const forked = applyAnswer(items, "audience", "clients");
    assert.ok(forked);
    assert.equal(picksDifferFromRecommended(forked), true);
  });
});
