"use client";

import { motion } from "framer-motion";
import { AgentAvatar } from "./agent-avatar";
import type { OfficeAgent } from "@/lib/office";
import { OFFICE_ROOMS } from "@/lib/constants";
import { cn } from "@/lib/utils";

type OfficeFloorProps = {
  agents: OfficeAgent[];
  desks: Array<{ id: string; label: string; x: number; y: number; room: string }>;
  selectedAgentId?: string | null;
  onSelectAgent?: (id: string) => void;
  agentStatuses?: Record<string, OfficeAgent["status"]>;
};

const CELL = 80;

export function OfficeFloor({
  agents,
  desks,
  selectedAgentId,
  onSelectAgent,
  agentStatuses = {},
}: OfficeFloorProps) {
  const agentsByDesk = new Map(
    agents.filter((a) => a.desk).map((a) => [`${a.desk!.x}-${a.desk!.y}`, a]),
  );

  return (
    <div className="relative overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-6">
      {OFFICE_ROOMS.map((room, ri) => {
        const roomDesks = desks.filter((d) => d.room === room);
        if (roomDesks.length === 0) return null;
        const minY = Math.min(...roomDesks.map((d) => d.y));
        const maxY = Math.max(...roomDesks.map((d) => d.y));
        const minX = Math.min(...roomDesks.map((d) => d.x));
        const maxX = Math.max(...roomDesks.map((d) => d.x));

        return (
          <div key={room} className={cn("mb-8", ri > 0 && "mt-4")}>
            <div className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
              {room}
            </div>
            <div
              className="relative rounded-lg border border-zinc-800/60 bg-zinc-900/40"
              style={{
                width: (maxX - minX + 2) * CELL + 40,
                height: (maxY - minY + 2) * CELL + 40,
                minWidth: 300,
                minHeight: 120,
              }}
            >
              {roomDesks.map((desk) => {
                const agent = agentsByDesk.get(`${desk.x}-${desk.y}`);
                const status = agent ? (agentStatuses[agent.id] ?? agent.status) : undefined;
                return (
                  <motion.div
                    key={desk.id}
                    className="absolute"
                    style={{
                      left: (desk.x - minX) * CELL + 20,
                      top: (desk.y - minY) * CELL + 20,
                    }}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <div className="flex h-16 w-16 flex-col items-center justify-end">
                      <div className="mb-1 h-8 w-12 rounded-t border border-zinc-700 bg-zinc-800/80" />
                      <span className="text-[9px] text-zinc-600">{desk.label}</span>
                      {agent && (
                        <div className="absolute -top-2">
                          <AgentAvatar
                            name={agent.name}
                            color={agent.avatarColor}
                            status={status ?? agent.status}
                            selected={selectedAgentId === agent.id}
                            onClick={() => onSelectAgent?.(agent.id)}
                            size="sm"
                          />
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
