import {
  missingProductHints,
  violatedForbiddenTerms,
} from "./goal-fidelity";

export type PlanIssue = {
  severity: "fail" | "warn";
  message: string;
};

export type PlanReport = {
  passed: boolean;
  issues: PlanIssue[];
};

export const PRODUCT_IMPL_FAIL_MESSAGE =
  "Task list assigns implementation (HTML/CSS/JS files) to Product. Product owns users, copy, and success; Engineer writes the files.";

export const SENIOR_CSS_FAIL_MESSAGE =
  "Task list assigns routine CSS/testing to Senior Developer. They own stack and file shape; Engineer builds and tests the static files.";

const DEFAULT_ROLE_TASK_LIST = `## Task list
- Product Manager: audience, success metrics, and real product copy.
- UI/UX Designer: layout, tokens, empty/confirmation states.
- Senior Developer: stack, file list, and persistence shape.
- Engineer (or Senior Developer when solo): build and test the static HTML/CSS/JS files.
`;

function isSimpleStaticPlan(plan: string): boolean {
  const stack =
    /html\s*(\+|and|,)\s*css|static (site|page|html)|localStorage|landing page|portfolio|single[- ]page|one[- ]page/i.test(
      plan,
    );
  const heavy =
    /\b(auth|oauth|postgres|mongodb|prisma|stripe|websockets?|ci\/cd|kubernetes|microservices?)\b/i.test(
      plan,
    );
  return stack && !heavy;
}

function dayMarkers(plan: string): string[] {
  return plan.match(/\bday\s*(?:[1-9]|1[0-4])\b/gi) ?? [];
}

function taskListChunk(plan: string): string {
  const match = plan.match(
    /(?:^|\n)#{1,3}\s*(?:task list|tasks|work breakdown|wbs|milestones)\b[\s\S]*/i,
  );
  return match?.[0] ?? plan;
}

function isProductRoleLine(line: string): boolean {
  return /\b(product manager|project manager|\bpm\b)\b/i.test(line);
}

function isSeniorRoleLine(line: string): boolean {
  return /\b(tech architect|senior developer)\b/i.test(line);
}

/** Clear “Product builds the files” — not “Product owns hero copy”. */
export function productLineAssignsImplementation(line: string): boolean {
  if (!isProductRoleLine(line)) return false;
  // Copy / brief work next to “hero” / “footer” is fine.
  const copyOwned =
    /\b(copy|messaging|audience|success|metrics|requirements|brief|wording|tone|voice)\b/i.test(
      line,
    );
  const fileBuild =
    /\b(html|css|javascript|\.js\b|index\.html|styles\.css|static files?)\b/i.test(line) ||
    /\b(write|code|implement)\b.{0,48}\b(html|css|javascript|page|site|app)\b/i.test(line) ||
    /\bbuild (the )?(hero|footer|page|site|app|ui)\b.{0,40}\b(html|css|in code|in files|javascript)?\b/i.test(
      line,
    ) ||
    /\b(product manager|project manager|\bpm\b)\s*:\s*build\b/i.test(line);
  if (!fileBuild) return false;
  if (copyOwned && !/\b(html|css|javascript|index\.html|write html|code the)\b/i.test(line)) {
    return false;
  }
  return true;
}

export function seniorLineAssignsRoutineCss(line: string): boolean {
  if (!isSeniorRoleLine(line)) return false;
  return /\b(test css|routine css|style the footer|write the css|implement the css)\b/i.test(line);
}

/**
 * Deterministic fix when the synthesizer mis-assigns Product → HTML or Senior → routine CSS.
 * Keeps Goal/UX/features; rewrites bad task lines and ensures an Engineer build line exists.
 */
export function repairPlanRoleAssignments(plan: string): string {
  const text = plan.trim();
  if (!text) return DEFAULT_ROLE_TASK_LIST.trim();

  const match = text.match(
    /((?:^|\n)#{1,3}\s*(?:task list|tasks|work breakdown|wbs|milestones)\b)([\s\S]*)/i,
  );

  const fixLines = (chunk: string) => {
    const lines = chunk.split("\n").map((line) => {
      if (productLineAssignsImplementation(line)) {
        return "- Product Manager: audience, success metrics, and real product copy.";
      }
      if (seniorLineAssignsRoutineCss(line)) {
        return "- Senior Developer: stack, file list, and persistence shape.";
      }
      return line;
    });
    const body = lines.join("\n");
    if (
      !/\bengineer\b/i.test(body) &&
      !/\b(senior developer|tech architect)\b[^\n]{0,100}\b(build|implement|emit)\b/i.test(body)
    ) {
      return `${body.replace(/\s+$/, "")}\n- Engineer: build and test the static HTML/CSS/JS files.\n`;
    }
    return body;
  };

  if (!match || match.index === undefined) {
    return `${text}\n\n${DEFAULT_ROLE_TASK_LIST}`.trim();
  }

  const heading = match[1] ?? "";
  const rest = match[2] ?? "";
  const before = text.slice(0, match.index);
  return `${before}${heading}${fixLines(rest)}`.trim();
}

export function formatPlanReport(report: PlanReport): string {
  if (report.issues.length === 0) return "Automated plan check: PASS (no issues found).";
  const lines = report.issues.map((i) => `- [${i.severity.toUpperCase()}] ${i.message}`);
  return `Automated plan check: ${report.passed ? "WARN" : "FAIL"}\n${lines.join("\n")}`;
}

function onlyRoleAssignmentFails(report: PlanReport): boolean {
  if (report.passed || report.issues.length === 0) return false;
  return report.issues.every(
    (i) =>
      i.message === PRODUCT_IMPL_FAIL_MESSAGE || i.message === SENIOR_CSS_FAIL_MESSAGE,
  );
}

/**
 * Soften + auto-repair path for synth/plan gates.
 * When the only FAILs are mis-assigned Product/Senior tasks, rewrite those lines
 * (or replace the task list) so a wording slip cannot kill the whole run.
 */
export function ensurePlanPassesRoleAssignments(
  plan: string,
  opts: { ceoGoal?: string } = {},
): { plan: string; repaired: boolean; report: PlanReport } {
  const initial = evalPlanQuality(plan, opts);
  if (initial.passed) return { plan, repaired: false, report: initial };

  let next = repairPlanRoleAssignments(plan);
  let report = evalPlanQuality(next, opts);
  if (report.passed) return { plan: next, repaired: true, report };

  if (onlyRoleAssignmentFails(initial) || onlyRoleAssignmentFails(report)) {
    const replaced = plan.replace(
      /(?:^|\n)#{1,3}\s*(?:task list|tasks|work breakdown|wbs|milestones)\b[\s\S]*/i,
      `\n\n${DEFAULT_ROLE_TASK_LIST}`,
    );
    next =
      replaced === plan
        ? `${plan.trim()}\n\n${DEFAULT_ROLE_TASK_LIST}`.trim()
        : replaced.trim();
    report = evalPlanQuality(next, opts);
    return { plan: next, repaired: true, report };
  }

  return { plan: next, repaired: true, report };
}

/** Catch scope drift, inflated-agency, and mis-assigned-build patterns before publish. */
export function evalPlanQuality(
  plan: string,
  opts: { ceoGoal?: string } = {},
): PlanReport {
  const issues: PlanIssue[] = [];
  const text = plan.trim();
  const ceoGoal = opts.ceoGoal?.trim() ?? "";
  if (text.length < 80) {
    return {
      passed: false,
      issues: [{ severity: "fail", message: "Plan is too thin to publish." }],
    };
  }

  if (isSimpleStaticPlan(text)) {
    const days = new Set(dayMarkers(text).map((d) => d.toLowerCase().replace(/\s+/g, " ")));
    const weekGantt =
      /\b(?:7|seven)[ -]?days?\s+(?:timeline|plan|schedule|sprint)\b/i.test(text) ||
      /\bweek[- ]by[- ]week\b/i.test(text);
    if (days.size >= 5 || weekGantt) {
      issues.push({
        severity: "fail",
        message:
          "Timeline is sized like an agency sprint. A static HTML/CSS/JS page is hours / one session, not a 5–7 day Gantt with a day per section.",
      });
    }
  }

  if (ceoGoal) {
    const missingHints = missingProductHints(text, ceoGoal);
    if (missingHints.length > 0) {
      issues.push({
        severity: "fail",
        message: `Combined plan dropped the CEO product (${missingHints.slice(0, 3).join(", ")}). Preserve the named product and its requested experience.`,
      });
    }

    const forbidden = violatedForbiddenTerms(text, ceoGoal);
    if (forbidden.length > 0) {
      issues.push({
        severity: "fail",
        message: `Combined plan violates explicit CEO bans (${forbidden.join(", ")}). Remove those invented sections or patterns.`,
      });
    }

    const plansPortfolio = text.split("\n").some(
      (line) =>
        /\bportfolio\b/i.test(line) &&
        !/(?:do\s+not|don't|never|no|without|avoid)\b[^.]{0,80}\bportfolio\b/i.test(line),
    );
    if (!/\bportfolio\b/i.test(ceoGoal) && plansPortfolio) {
      issues.push({
        severity: "fail",
        message:
          "Combined plan changed a non-portfolio CEO goal into a portfolio. Plan the requested product instead of applying a generic site template.",
      });
    }
  }

  const tasks = taskListChunk(text);
  for (const line of tasks.split("\n")) {
    if (productLineAssignsImplementation(line)) {
      issues.push({
        severity: "fail",
        message: PRODUCT_IMPL_FAIL_MESSAGE,
      });
      break;
    }
  }
  for (const line of tasks.split("\n")) {
    if (seniorLineAssignsRoutineCss(line)) {
      issues.push({
        severity: "fail",
        message: SENIOR_CSS_FAIL_MESSAGE,
      });
      break;
    }
  }

  if (/javascript:\s*void/i.test(text) || /onclick\s*=\s*["']openForm/i.test(text)) {
    issues.push({
      severity: "fail",
      message:
        "Plan still specifies inline JS (javascript:void(0) / onclick). Hero CTA should be href=\"#contact\"; bind submit with addEventListener.",
    });
  }

  if (
    /localStorage\.setItem\(\s*['"]contactMessage['"]/i.test(text) &&
    !/\.push\s*\(/.test(text)
  ) {
    issues.push({
      severity: "fail",
      message:
        "Contact persistence overwrites a single localStorage key. Store an array: parse existing JSON, push the new entry, save back.",
    });
  }

  const unique = new Map<string, PlanIssue>();
  for (const issue of issues) unique.set(issue.message, issue);
  const list = [...unique.values()];
  return {
    passed: list.every((i) => i.severity !== "fail"),
    issues: list,
  };
}
