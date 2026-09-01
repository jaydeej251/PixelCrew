"use client";

import { useEffect, useState } from "react";
import { Drawer } from "@/components/ui/drawer";
import { EVENT_LABELS, isMilestoneEvent, joinedThinking } from "@/lib/events";
import type { RunEventMessage } from "@/lib/events";
import type { OfficeAgent } from "@/lib/office";

type InspectorDrawerProps = {
  open: boolean;
  onClose: () => void;
  agent: OfficeAgent | null;
  events: RunEventMessage[];
  streamText?: string;
};

type Memory = { id: string; content: string; createdAt: string };

export function InspectorDrawer({
  open,
  onClose,
  agent,
  events,
  streamText,
}: InspectorDrawerProps) {
  const [memories, setMemories] = useState<Memory[]>([]);

  const agentEvents = agent
    ? events
        .filter((e) => e.id && (e.agentId === agent.id || e.payload.agentId === agent.id))
        .filter((e, i, all) => all.findIndex((x) => x.id === e.id) === i)
    : [];

  const milestones = agentEvents.filter((e) => isMilestoneEvent(e.type));
  const liveWriting = streamText || joinedThinking(agentEvents);
  const doneCount = milestones.filter((e) => e.type === "AGENT_TASK_DONE").length;
  const writingLabel = agent?.status === "working" ? "Live writing" : "Last draft";

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

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={agent ? `${agent.name} — ${agent.positionLabel}` : "Inspector"}
    >
      {agent ? (
        <div className="space-y-4">
          <div>
            <p className="text-xs text-zinc-500">Provider / model</p>
            <p className="mt-1 text-sm text-zinc-300">
              {(agent as OfficeAgent & { provider?: string; model?: string }).provider ?? "mock"}{" "}
              / {(agent as OfficeAgent & { model?: string }).model ?? "mock"}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Job boundary</p>
            <p className="mt-1 text-sm text-zinc-300">{agent.jobBoundary ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Status</p>
            <p className="mt-1 text-sm capitalize text-zinc-200">{agent.status}</p>
          </div>
          {liveWriting && (
            <div>
              <p className="text-xs text-zinc-500">{writingLabel}</p>
              <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-zinc-900 p-3 text-xs text-emerald-300">
                {liveWriting}
              </pre>
            </div>
          )}
          {memories.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-zinc-500">Memory</p>
              <ul className="space-y-2">
                {memories.slice(0, 3).map((m) => (
                  <li key={m.id} className="rounded-lg bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-sans">
                      {m.content}
                    </pre>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
                      {e.payload.message.length > 280
                        ? `${e.payload.message.slice(0, 280)}…`
                        : e.payload.message}
                    </p>
                  )}
                </li>
              ))}
              {milestones.length === 0 && (
                <li className="text-xs text-zinc-600">No activity yet</li>
              )}
            </ul>
          </div>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Select an agent on the floor</p>
      )}
    </Drawer>
  );
}
