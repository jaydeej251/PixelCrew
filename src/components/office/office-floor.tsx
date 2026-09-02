"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { CharacterSprite } from "./character-sprite";
import { depth, TILE_H, TILE_W, toIso } from "./iso";
import { cn } from "@/lib/utils";
import { edgeFromOffset, floorColorAt } from "@/lib/office-blueprint";
import {
  isMeetingRole,
  meetingSeatIndex,
  planningSeatGrid,
} from "./office-life";
import {
  GRID_MAX,
  GRID_MIN,
  ROOM_RECTS,
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
  inPlanning = false,
  blueprint,
  editor,
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
    return ROOM_RECTS.map((room) => {
      const x = (room.minX + room.maxX) / 2;
      const y = room.minY + 0.12;
      return { room: room.id, ...toIso(x, y) };
    });
  }, []);

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

  const meetingIds = agents
    .filter((a) => {
      const st = agentStatuses[a.id] ?? a.status;
      return isMeetingRole(a.position) && (inPlanning || st === "working" || st === "walking");
    })
    .map((a) => a.id);

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
          const hex = floorColorAt(blueprint, t.x, t.y);
          return (
            <button
              key={t.key}
              type="button"
              className="iso-tile"
              disabled={!editor?.enabled}
              onClick={(e) => {
                if (!editor?.enabled) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const dx = (e.clientX - rect.left) / Math.max(1, rect.width) - 0.5;
                const dy = (e.clientY - rect.top) / Math.max(1, rect.height) - 0.5;
                // Screen Y down ≈ world +Z (south); screen X ≈ world +X (east).
                editor.onTile(t.x, t.y, edgeFromOffset(dx, dy));
              }}
              style={{
                left: iso.left,
                top: iso.top,
                zIndex: depth(t.x, t.y),
                background: hex,
              }}
            />
          );
        })}

        {!blueprint &&
          plants.map((t) => {
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

        {blueprint?.objects
          .filter((obj) => editor?.enabled || obj.kind !== "desk")
          .map((obj) => {
            const iso = toIso(obj.x, obj.y);
            const cls =
              obj.kind === "whiteboard"
                ? "iso-board"
                : obj.kind === "tv"
                  ? "iso-tv"
                  : obj.kind === "conference" || obj.kind === "table" || obj.kind === "counter"
                    ? "iso-table"
                    : obj.kind === "chair"
                      ? "iso-meet-chair"
                      : obj.kind === "rug"
                        ? "iso-rug"
                        : obj.kind === "desk"
                          ? "iso-desk-top"
                          : "iso-plant";
            return (
              <div
                key={obj.id}
                className={cls}
                style={{
                  left: iso.left + TILE_W / 2 - 18,
                  top: iso.top + 4,
                  zIndex: depth(obj.x, obj.y) + 4,
                }}
              />
            );
          })}

        {!(editor?.enabled) &&
          desks.map((desk) => {
          const iso = toIso(desk.x, desk.y);
          const agent = agentsByDesk.get(`${desk.x}-${desk.y}`);
          const working = Boolean(
            agent &&
              (agentStatuses[agent.id] ?? agent.status) === "working" &&
              !isMeetingRole(agent.position),
          );
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
          const meet =
            isMeetingRole(agent.position) &&
            (inPlanning || status === "working" || status === "walking");
          const at = meet
            ? planningSeatGrid(meetingSeatIndex(agent.id, meetingIds))
            : status === "working" || status === "walking"
              ? (agent.desk ?? { x: 4, y: 4 })
              : agentGridPos(agent, status, desks, agents, events);
          const iso = toIso(at.x, at.y);
          const seated = meet || status === "working";
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
