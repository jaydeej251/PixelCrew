"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { CharacterSprite } from "./character-sprite";
import { depth, TILE_H, TILE_W, toIso } from "./iso";
import { OFFICE_ROOMS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  GRID_MAX,
  GRID_MIN,
  ROOM_HEX,
  agentGridPos,
  cellRoom,
  type OfficeViewProps,
} from "./office-layout";

export function OfficeFloor({
  agents,
  desks,
  selectedAgentId,
  onSelectAgent,
  agentStatuses = {},
  events = [],
  onShift = false,
}: OfficeViewProps) {
  const tiles = useMemo(() => {
    const list: Array<{ key: string; x: number; y: number; room: string }> = [];
    for (let y = GRID_MIN; y <= GRID_MAX; y++) {
      for (let x = GRID_MIN; x <= GRID_MAX; x++) {
        list.push({ key: `${x}-${y}`, x, y, room: cellRoom(x, y, desks) });
      }
    }
    return list.sort((a, b) => a.x + a.y - (b.x + b.y));
  }, [desks]);

  const plants = useMemo(
    () =>
      tiles.filter(
        (t) =>
          t.room === "grass" &&
          (t.x + t.y) % 4 === 0 &&
          t.x !== GRID_MIN &&
          t.y !== GRID_MIN,
      ),
    [tiles],
  );

  const roomAnchors = useMemo(() => {
    return OFFICE_ROOMS.map((room) => {
      const inRoom = desks.filter((d) => d.room === room);
      if (inRoom.length === 0) return null;
      const x = inRoom.reduce((s, d) => s + d.x, 0) / inRoom.length;
      const y = inRoom.reduce((s, d) => s + d.y, 0) / inRoom.length - 1.15;
      return { room, ...toIso(x, y) };
    }).filter(Boolean) as Array<{ room: string; left: number; top: number }>;
  }, [desks]);

  const bounds = useMemo(() => {
    const pts = tiles.map((t) => toIso(t.x, t.y));
    const lefts = pts.map((p) => p.left);
    const tops = pts.map((p) => p.top);
    return {
      minL: Math.min(...lefts) - 40,
      maxL: Math.max(...lefts) + TILE_W + 40,
      minT: Math.min(...tops) - 20,
      maxT: Math.max(...tops) + TILE_H + 120,
    };
  }, [tiles]);

  const agentsByDesk = new Map(
    agents.filter((a) => a.desk).map((a) => [`${a.desk!.x}-${a.desk!.y}`, a]),
  );

  const width = bounds.maxL - bounds.minL;
  const height = bounds.maxT - bounds.minT;

  return (
    <div className="office-stage">
      <div className="office-sky" />
      <div
        className="office-world"
        style={{
          width,
          height,
          marginLeft: -bounds.minL,
          marginTop: -bounds.minT,
        }}
      >
        {tiles.map((t) => {
          const iso = toIso(t.x, t.y);
          const colors = ROOM_HEX[t.room] ?? ROOM_HEX.hall;
          const checker = (t.x + t.y) % 2 === 0;
          return (
            <div
              key={t.key}
              className="iso-tile"
              style={{
                left: iso.left,
                top: iso.top,
                zIndex: depth(t.x, t.y),
                background: checker ? colors[0] : colors[1],
              }}
            />
          );
        })}

        {plants.map((t) => {
          const iso = toIso(t.x, t.y);
          return (
            <div
              key={`plant-${t.key}`}
              className="iso-plant"
              style={{
                left: iso.left + TILE_W / 2 - 8,
                top: iso.top + 4,
                zIndex: depth(t.x, t.y) + 2,
              }}
            />
          );
        })}

        {roomAnchors.map((r) => (
          <div
            key={r.room}
            className="iso-room-label"
            style={{ left: r.left + TILE_W / 2, top: r.top, zIndex: 400 }}
          >
            {r.room}
          </div>
        ))}

        {desks.map((desk) => {
          const iso = toIso(desk.x, desk.y);
          const agent = agentsByDesk.get(`${desk.x}-${desk.y}`);
          const status = agent ? (agentStatuses[agent.id] ?? agent.status) : "idle";
          const working = status === "working";
          return (
            <div
              key={desk.id}
              className="iso-desk-wrap"
              style={{
                left: iso.left + 10,
                top: iso.top - 18,
                zIndex: depth(desk.x, desk.y) + 5,
              }}
            >
              <button
                type="button"
                className={cn("iso-desk", working && "is-lit")}
                onClick={() => agent && onSelectAgent?.(agent.id)}
                disabled={!agent}
                aria-label={agent ? `${agent.name}'s desk` : desk.label}
              >
                <span className="iso-desk-top" />
                <span className="iso-desk-leg left" />
                <span className="iso-desk-leg right" />
                <span className="iso-monitor">
                  <span className="iso-screen" />
                </span>
                <span className="iso-chair" />
              </button>
            </div>
          );
        })}

        {agents.map((agent) => {
          const status = agentStatuses[agent.id] ?? agent.status;
          const at =
            onShift && status !== "blocked" && status !== "error"
              ? (agent.desk ?? { x: 4, y: 4 })
              : agentGridPos(agent, status, desks, agents, events);
          const iso = toIso(at.x, at.y);
          const seated = onShift || status === "working" || status === "idle";
          return (
            <motion.div
              key={agent.id}
              className="iso-actor"
              initial={false}
              animate={{
                left: iso.left + (seated ? 28 : 18),
                top: iso.top + (seated ? -36 : -52),
              }}
              transition={{
                duration: status === "handoff" || status === "walking" ? 1.8 : 0.45,
                ease: "easeInOut",
              }}
              style={{ zIndex: depth(at.x, at.y) + 8 }}
            >
              <CharacterSprite
                name={agent.name}
                color={agent.avatarColor}
                status={status}
                selected={selectedAgentId === agent.id}
                onClick={() => onSelectAgent?.(agent.id)}
              />
            </motion.div>
          );
        })}
      </div>
      <p className="office-hint">Click someone to see what they’re working on</p>
    </div>
  );
}
