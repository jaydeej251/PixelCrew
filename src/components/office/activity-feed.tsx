"use client";

import { isMilestoneEvent } from "@/lib/events";
import type { RunEventMessage } from "@/lib/events";
import { cn } from "@/lib/utils";

const FRIENDLY: Partial<Record<RunEventMessage["type"], string>> = {
  TASK_CLAIMED: "picked up",
  TASK_STARTED: "started",
  AGENT_HANDOFF: "asked for help",
  AGENT_BLOCKED: "got stuck",
  AGENT_ERROR: "hit a problem",
  AGENT_TASK_DONE: "finished",
  RUN_COMPLETED: "The team finished",
  RUN_CANCELLED: "Stopped",
  EXECUTION_STARTED: "started execution",
  TOOL_STARTED: "started a tool",
  TOOL_COMPLETED: "completed a tool",
  TOOL_FAILED: "had a tool fail",
  CHECK_PASSED: "passed a check",
  CHECK_FAILED: "failed a check",
  APPROVAL_REQUIRED: "needs approval",
  APPROVAL_RESOLVED: "received an approval decision",
  DIFF_READY: "prepared changes",
  EXECUTION_COMPLETED: "completed execution",
  SANDBOX_TERMINATED: "closed the sandbox",
};

function lineFor(event: RunEventMessage): string {
  const verb = FRIENDLY[event.type] ?? event.type;
  const who = event.payload.agentName;
  const task = event.payload.taskTitle;
  if (event.type === "RUN_COMPLETED" || event.type === "RUN_CANCELLED") {
    return verb;
  }
  if (who && task) return `${who} ${verb} “${task}”`;
  if (who) return `${who} ${verb}`;
  return verb;
}

type ActivityFeedProps = {
  events: RunEventMessage[];
  /** Fill a tall parent instead of the legacy compact max-h-40 card. */
  fill?: boolean;
  className?: string;
};

export function ActivityFeed({ events, fill = false, className }: ActivityFeedProps) {
  const items = events
    .filter((e, i, all) => e.id && all.findIndex((x) => x.id === e.id) === i)
    .filter((e) => isMilestoneEvent(e.type))
    .slice(fill ? -80 : -16)
    .reverse();

  // Compact standalone card: hide when empty. Tall parent card: show a waiting line.
  if (items.length === 0 && !fill) return null;

  return (
    <section
      className={cn(
        fill
          ? "min-h-0"
          : "max-h-40 overflow-y-auto rounded-xl border border-zinc-800/80 bg-zinc-950/75 p-3 backdrop-blur-md",
        className,
      )}
    >
      <h2 className="mb-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        What’s happening
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">Waiting for the team…</p>
      ) : (
        <ol className="space-y-0 border-l border-zinc-800 pl-4">
          {items.map((e) => (
            <li key={e.id} className="relative py-2.5">
              <span className="absolute -left-[21px] top-4 size-2 rounded-full bg-zinc-600" />
              <p className="text-sm text-zinc-200">{lineFor(e)}</p>
              {e.payload.message &&
                e.payload.message !== e.payload.taskTitle &&
                e.type !== "AGENT_TASK_DONE" && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
                    {e.payload.message}
                  </p>
                )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
