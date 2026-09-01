"use client";

import { Drawer } from "@/components/ui/drawer";
import { EVENT_LABELS } from "@/lib/events";
import type { RunEventMessage } from "@/lib/events";
import type { OfficeAgent } from "@/lib/office";

type InspectorDrawerProps = {
  open: boolean;
  onClose: () => void;
  agent: OfficeAgent | null;
  events: RunEventMessage[];
  streamText?: string;
};

export function InspectorDrawer({
  open,
  onClose,
  agent,
  events,
  streamText,
}: InspectorDrawerProps) {
  const agentEvents = agent
    ? events.filter((e) => e.agentId === agent.id || e.payload.agentId === agent.id)
    : [];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={agent ? `${agent.name} — ${agent.positionLabel}` : "Inspector"}
    >
      {agent ? (
        <div className="space-y-4">
          <div>
            <p className="text-xs text-zinc-500">Job boundary</p>
            <p className="mt-1 text-sm text-zinc-300">{agent.jobBoundary ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Status</p>
            <p className="mt-1 text-sm capitalize text-zinc-200">{agent.status}</p>
          </div>
          {streamText && (
            <div>
              <p className="text-xs text-zinc-500">Live output</p>
              <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-zinc-900 p-3 text-xs text-emerald-300">
                {streamText}
              </pre>
            </div>
          )}
          <div>
            <p className="mb-2 text-xs text-zinc-500">Event log</p>
            <ul className="space-y-2">
              {agentEvents.map((e) => (
                <li key={e.id} className="rounded-lg bg-zinc-900 px-3 py-2 text-xs">
                  <span className="font-medium text-indigo-400">{EVENT_LABELS[e.type]}</span>
                  {e.payload.message && (
                    <p className="mt-1 text-zinc-400">{e.payload.message}</p>
                  )}
                  {e.payload.taskTitle && (
                    <p className="mt-0.5 text-zinc-500">{e.payload.taskTitle}</p>
                  )}
                </li>
              ))}
              {agentEvents.length === 0 && (
                <li className="text-xs text-zinc-600">No events yet</li>
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
