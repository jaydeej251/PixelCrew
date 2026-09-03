"use client";

import { useEffect, useMemo, useState } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Markdown } from "@/components/ui/markdown";
import { EVENT_LABELS, isMilestoneEvent } from "@/lib/events";
import type { RunEventMessage } from "@/lib/events";
import type { OfficeAgent } from "@/lib/office";
import { buildThoughtProcess, type ThoughtTask } from "@/lib/thought-process";
import { cn } from "@/lib/utils";

type InspectorDrawerProps = {
  open: boolean;
  onClose: () => void;
  agent: OfficeAgent | null;
  events: RunEventMessage[];
  streamText?: string;
  ceoGoal?: string;
  tasks?: ThoughtTask[];
  agents?: Array<{ id: string; name: string }>;
};

type Memory = { id: string; content: string; createdAt: string; runId?: string | null };

export function InspectorDrawer({
  open,
  onClose,
  agent,
  events,
  streamText,
  ceoGoal = "",
  tasks = [],
  agents = [],
}: InspectorDrawerProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [section, setSection] = useState<"writing" | "brief" | "activity">("writing");
  const [stepId, setStepId] = useState<string | null>(null);

  const agentEvents = agent
    ? events
        .filter((e) => e.id && (e.agentId === agent.id || e.payload.agentId === agent.id))
        .filter((e, i, all) => all.findIndex((x) => x.id === e.id) === i)
    : [];

  const milestones = agentEvents.filter((e) => isMilestoneEvent(e.type));
  const doneCount = milestones.filter((e) => e.type === "AGENT_TASK_DONE").length;

  const steps = useMemo(() => {
    if (!agent) return [];
    return buildThoughtProcess({
      ceoGoal,
      tasks,
      events,
      agents: agents.length ? agents : [{ id: agent.id, name: agent.name }],
    }).steps.filter((s) => s.agentId === agent.id);
  }, [agent, ceoGoal, tasks, events, agents]);

  const activeStep = steps.find((s) => s.id === stepId) ?? steps[steps.length - 1] ?? null;
  const writing =
    streamText ||
    activeStep?.thinking ||
    steps.map((s) => s.thinking).filter(Boolean).join("\n\n---\n\n");
  const writingLabel = agent?.status === "working" ? "Writing now" : "What they wrote";

  useEffect(() => {
    if (!agent?.id || !open) {
      setMemories([]);
      return;
    }
    fetch(`/api/agents/${agent.id}`)
      .then((r) => r.json())
      .then(setMemories)
      .catch(() => setMemories([]));
  }, [agent?.id, open, doneCount]);

  useEffect(() => {
    setStepId(steps[steps.length - 1]?.id ?? null);
    setSection(agent?.status === "working" ? "writing" : "writing");
  }, [agent?.id, steps.length]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={agent ? agent.name : "Teammate"}
      className="max-w-lg"
    >
      {agent ? (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">{agent.positionLabel}</p>
          <div>
            <p className="text-xs text-zinc-500">What they do</p>
            <p className="mt-1 text-sm text-zinc-300">{agent.jobBoundary ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Right now</p>
            <p className="mt-1 text-sm text-zinc-200">
              {agent.status === "working"
                ? "Working"
                : agent.status === "blocked" || agent.status === "error"
                  ? "Stuck"
                  : agent.status === "handoff" || agent.status === "walking"
                    ? "Passing work"
                    : "Ready"}
            </p>
          </div>

          {steps.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs text-zinc-500">Their steps this chat</p>
              <div className="flex flex-wrap gap-1">
                {steps.map((step, i) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setStepId(step.id)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px]",
                      (activeStep?.id ?? "") === step.id
                        ? "bg-indigo-500/20 text-indigo-100"
                        : "bg-zinc-900 text-zinc-400 hover:text-zinc-200",
                    )}
                  >
                    {i + 1}. {step.taskTitle}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-1">
            {(
              [
                ["writing", "What they wrote"],
                ["brief", "What we asked"],
                ["activity", "Activity"],
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
                    : "bg-zinc-900 text-zinc-400 hover:text-zinc-200",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {section === "writing" && (
            <div>
              <p className="mb-1 text-xs text-zinc-500">{writingLabel}</p>
              {writing ? (
                <div className="max-h-[28rem] overflow-auto rounded-lg bg-zinc-900 p-3">
                  <Markdown compact>{writing}</Markdown>
                </div>
              ) : (
                <p className="text-sm text-zinc-600">Nothing written yet for this teammate.</p>
              )}
            </div>
          )}

          {section === "brief" && (
            <div>
              <p className="mb-1 text-xs text-zinc-500">What we asked them</p>
              {activeStep?.brief ? (
                <div className="max-h-[28rem] overflow-auto rounded-lg bg-zinc-900 p-3">
                  <Markdown compact>{activeStep.brief}</Markdown>
                </div>
              ) : (
                <p className="text-sm text-zinc-600">
                  No brief stored yet. New runs save this when a teammate starts a task.
                </p>
              )}
              {activeStep?.result ? (
                <div className="mt-3">
                  <p className="mb-1 text-xs text-zinc-500">Saved result</p>
                  <div className="max-h-56 overflow-auto rounded-lg bg-zinc-900 p-3">
                    <Markdown compact>{activeStep.result}</Markdown>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {section === "activity" && (
            <div>
              <p className="mb-2 text-xs text-zinc-500">Activity</p>
              <ul className="space-y-2">
                {milestones.map((e) => (
                  <li key={e.id} className="rounded-lg bg-zinc-900 px-3 py-2 text-xs">
                    <span className="font-medium text-indigo-400">{EVENT_LABELS[e.type]}</span>
                    {e.payload.taskTitle && (
                      <p className="mt-0.5 text-zinc-300">{e.payload.taskTitle}</p>
                    )}
                    {e.type !== "AGENT_TASK_DONE" &&
                      e.payload.message &&
                      e.payload.message !== e.payload.taskTitle && (
                        <p className="mt-1 whitespace-pre-wrap text-zinc-400">
                          {e.payload.message.length > 400
                            ? `${e.payload.message.slice(0, 400)}…`
                            : e.payload.message}
                        </p>
                      )}
                  </li>
                ))}
                {milestones.length === 0 && (
                  <li className="text-xs text-zinc-600">No activity yet</li>
                )}
              </ul>
              {memories.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs text-zinc-500">Memory</p>
                  <ul className="space-y-2">
                    {memories.slice(0, 5).map((m) => (
                      <li key={m.id} className="rounded-lg bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
                        <div className="max-h-40 overflow-auto">
                          <Markdown compact>{m.content}</Markdown>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Click a teammate to see what they’re working on.</p>
      )}
    </Drawer>
  );
}
