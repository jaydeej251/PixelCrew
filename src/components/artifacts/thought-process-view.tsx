"use client";

import { useMemo, useState } from "react";
import { Markdown } from "@/components/ui/markdown";
import { buildThoughtProcess, type ThoughtTask } from "@/lib/thought-process";
import type { RunEventMessage } from "@/lib/events";
import { cn } from "@/lib/utils";

type ThoughtProcessViewProps = {
  ceoGoal: string;
  tasks: ThoughtTask[];
  events: RunEventMessage[];
  agents: Array<{ id: string; name: string }>;
};

function statusLabel(status: string) {
  if (status === "done") return "Finished";
  if (status === "in_progress" || status === "claimed") return "Working";
  if (status === "failed") return "Failed";
  if (status === "blocked") return "Stuck";
  return status;
}

export function ThoughtProcessView({
  ceoGoal,
  tasks,
  events,
  agents,
}: ThoughtProcessViewProps) {
  const process = useMemo(
    () => buildThoughtProcess({ ceoGoal, tasks, events, agents }),
    [ceoGoal, tasks, events, agents],
  );
  const [openId, setOpenId] = useState<string | null>(process.steps[0]?.id ?? null);
  const [section, setSection] = useState<"brief" | "thinking" | "result">("thinking");

  if (!process.ceoGoal && process.steps.length === 0) {
    return (
      <p className="px-1 py-10 text-center text-sm text-zinc-600">
        After the team works, you can review what you asked for and what each person wrote here.
      </p>
    );
  }

  const open = process.steps.find((s) => s.id === openId) ?? process.steps[0] ?? null;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">You asked</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-100">
          {process.ceoGoal || "—"}
        </p>
      </div>

      {process.steps.length === 0 ? (
        <p className="text-center text-sm text-zinc-600">No teammate steps yet.</p>
      ) : (
        <>
          <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-zinc-600">
            Thought process
          </p>
          <ul className="space-y-1">
            {process.steps.map((step, i) => {
              const selected = open?.id === step.id;
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenId(step.id);
                      setSection(
                        step.thinking ? "thinking" : step.result ? "result" : "brief",
                      );
                    }}
                    className={cn(
                      "w-full rounded-lg border px-2.5 py-2 text-left transition-colors",
                      selected
                        ? "border-indigo-400/50 bg-indigo-500/10"
                        : "border-transparent hover:bg-zinc-900",
                    )}
                  >
                    <p className="text-[11px] text-zinc-500">
                      {i + 1}. {step.agentName}
                      <span className="mx-1 text-zinc-700">·</span>
                      {statusLabel(step.status)}
                    </p>
                    <p className="truncate text-sm text-zinc-200">{step.taskTitle}</p>
                  </button>
                </li>
              );
            })}
          </ul>

          {open && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
              <div className="mb-3 flex flex-wrap gap-1">
                {(
                  [
                    ["brief", "What we asked"],
                    ["thinking", "What they wrote"],
                    ["result", "Saved result"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSection(id)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium",
                      section === id
                        ? "bg-zinc-100 text-zinc-900"
                        : "bg-zinc-950 text-zinc-400 hover:text-zinc-200",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="max-h-[28rem] overflow-y-auto">
                {section === "brief" && (
                  open.brief ? (
                    <Markdown compact>{open.brief}</Markdown>
                  ) : (
                    <p className="text-sm text-zinc-500">No brief was stored for this step.</p>
                  )
                )}
                {section === "thinking" && (
                  open.thinking ? (
                    <Markdown compact>{open.thinking}</Markdown>
                  ) : (
                    <p className="text-sm text-zinc-500">
                      No live writing was captured for this step. Check the saved result.
                    </p>
                  )
                )}
                {section === "result" && (
                  open.result ? (
                    <Markdown compact>{open.result}</Markdown>
                  ) : (
                    <p className="text-sm text-zinc-500">Nothing saved for this step yet.</p>
                  )
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
