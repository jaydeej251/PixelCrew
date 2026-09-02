export type PlanIssue = {
  severity: "fail" | "warn";
  message: string;
};

export type PlanReport = {
  passed: boolean;
  issues: PlanIssue[];
};

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

export function formatPlanReport(report: PlanReport): string {
  if (report.issues.length === 0) return "Automated plan check: PASS (no issues found).";
  const lines = report.issues.map((i) => `- [${i.severity.toUpperCase()}] ${i.message}`);
  return `Automated plan check: ${report.passed ? "WARN" : "FAIL"}\n${lines.join("\n")}`;
}

/** Catch the inflated-agency / mis-assigned-build patterns before the CEO publishes. */
export function evalPlanQuality(plan: string): PlanReport {
  const issues: PlanIssue[] = [];
  const text = plan.trim();
  if (text.length < 80) {
    return {
      passed: false,
      issues: [{ severity: "fail", message: "Plan is too thin to publish." }],
    };
  }

  if (isSimpleStaticPlan(text)) {
    const days = new Set(dayMarkers(text).map((d) => d.toLowerCase().replace(/\s+/g, " ")));
    const weekGantt =
      /\b(7|seven)[ -]?days?\b/i.test(text) || /\bweek[- ]by[- ]week\b/i.test(text);
    if (days.size >= 5 || weekGantt) {
      issues.push({
        severity: "fail",
        message:
          "Timeline is sized like an agency sprint. A static HTML/CSS/JS page is hours / one session, not a 5–7 day Gantt with a day per section.",
      });
    }
  }

  const tasks = taskListChunk(text);
  if (
    /\b(product manager|project manager|\bpm\b)\b[\s\S]{0,120}\b(build|code|implement|write html|hero section|footer)\b/i.test(
      tasks,
    )
  ) {
    issues.push({
      severity: "fail",
      message:
        "Task list assigns implementation (hero/footer/HTML) to Product. Product owns users, copy, and success; Engineer writes the files.",
    });
  }
  if (
    /\b(tech architect|senior developer)\b[\s\S]{0,120}\b(test css|routine css|style the footer)\b/i.test(
      tasks,
    )
  ) {
    issues.push({
      severity: "fail",
      message:
        "Task list assigns routine CSS/testing to Senior Developer. They own stack and file shape; Engineer builds and tests the static files.",
    });
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
