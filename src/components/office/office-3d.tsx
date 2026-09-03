"use client";

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Html, OrbitControls, Sky } from "@react-three/drei";
import { MOUSE, PointLight, Vector3, type MeshStandardMaterial } from "three";
import {
  CELL,
  GRID_MAX,
  GRID_MIN,
  PLANNING_TABLE,
  ROOM_RECTS,
  agentGridPos,
  buildingWalls,
  gridToWorld,
  type OfficeViewProps,
  OFFICE_HTML_Z,
} from "./office-layout";
import { simulateOfficeLife, type LifeState } from "./office-life";
import { VoxelPerson } from "./voxel-person";
import { BlueprintObjects, GhostPreview } from "./layout-objects";
import { OfficeFurniture } from "./office-furniture";
import { edgeFromOffset, erasePreviewAt, floorColorAt } from "@/lib/office-blueprint";

function Voxel({
  position,
  size,
  color,
  emissive,
  emissiveIntensity = 0,
  opacity = 1,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={0.86}
        metalness={0}
        emissive={emissive ?? "#000000"}
        emissiveIntensity={emissiveIntensity}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
}

type HoverTile = { x: number; y: number; edge: "n" | "s" | "e" | "w" };

const CLICK_DRAG_PX = 7;

function FloorTiles({
  blueprint,
  editor,
  onHover,
}: {
  blueprint?: OfficeViewProps["blueprint"];
  editor?: OfficeViewProps["editor"];
  onHover?: (tile: HoverTile | null) => void;
}) {
  const tiles = useMemo(() => {
    const list: Array<{ key: string; x: number; y: number }> = [];
    for (let y = GRID_MIN; y <= GRID_MAX; y++) {
      for (let x = GRID_MIN; x <= GRID_MAX; x++) {
        list.push({ key: `${x}-${y}`, x, y });
      }
    }
    return list;
  }, []);
  const pressRef = useRef<{
    x: number;
    y: number;
    edge: "n" | "s" | "e" | "w";
    sx: number;
    sy: number;
  } | null>(null);

  return (
    <group>
      {tiles.map((t) => {
        const [cx, , cz] = gridToWorld(t.x, t.y);
        const hex = floorColorAt(blueprint, t.x, t.y);
        const reportHover = (point: { x: number; z: number }) => {
          const edge = edgeFromOffset(point.x - cx, point.z - cz);
          onHover?.({ x: t.x, y: t.y, edge });
        };
        return (
          <mesh
            key={t.key}
            position={[cx, 0.1, cz]}
            castShadow
            receiveShadow
            onPointerDown={(e) => {
              if (!editor?.enabled || e.button !== 0) return;
              // Do not stopPropagation — OrbitControls needs the drag.
              const edge = edgeFromOffset(e.point.x - cx, e.point.z - cz);
              pressRef.current = {
                x: t.x,
                y: t.y,
                edge,
                sx: e.clientX,
                sy: e.clientY,
              };
            }}
            onPointerUp={(e) => {
              if (!editor?.enabled || e.button !== 0 || !pressRef.current) return;
              const press = pressRef.current;
              pressRef.current = null;
              const dist = Math.hypot(e.clientX - press.sx, e.clientY - press.sy);
              if (dist > CLICK_DRAG_PX) return;
              e.stopPropagation();
              const edge = edgeFromOffset(e.point.x - cx, e.point.z - cz);
              editor.onTile(press.x, press.y, edge);
            }}
            onPointerMove={(e) => {
              if (!editor?.enabled) return;
              // Hover only — never stopPropagation (that killed right/left orbit).
              reportHover(e.point);
            }}
            onPointerOver={(e) => {
              if (!editor?.enabled) return;
              reportHover(e.point);
            }}
            onPointerOut={() => {
              onHover?.(null);
            }}
          >
            <boxGeometry args={[CELL * 0.98, 0.2, CELL * 0.98]} />
            <meshStandardMaterial color={hex} roughness={0.86} metalness={0} />
          </mesh>
        );
      })}
    </group>
  );
}

function Walls({
  blueprint,
  editor,
}: {
  blueprint?: OfficeViewProps["blueprint"];
  editor?: OfficeViewProps["editor"];
}) {
  const segs = useMemo(() => buildingWalls(blueprint?.walls), [blueprint?.walls]);
  const pressRef = useRef<{ key: string; sx: number; sy: number } | null>(null);
  const eraseMode = Boolean(editor?.enabled && editor.tool === "erase" && editor.onWall);

  return (
    <group>
      {segs.map((s) => {
        const h = s.kind === "doorpost" ? 1.58 : 1.42;
        const y = 0.22 + h / 2;
        const sx = Math.max(s.sx, 0.08);
        const sz = Math.max(s.sz, 0.08);
        // Fatter invisible hit target so thin walls are easy to click.
        const hitSx = Math.max(sx, 0.42);
        const hitSz = Math.max(sz, 0.42);
        return (
          <group key={s.key} position={[s.wx, y, s.wz]}>
            <Voxel position={[0, 0, 0]} size={[sx, h, sz]} color={s.color} />
            {eraseMode && (
              <mesh
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  pressRef.current = { key: s.key, sx: e.clientX, sy: e.clientY };
                }}
                onPointerUp={(e) => {
                  if (e.button !== 0 || !pressRef.current) return;
                  const press = pressRef.current;
                  pressRef.current = null;
                  if (press.key !== s.key) return;
                  if (Math.hypot(e.clientX - press.sx, e.clientY - press.sy) > CLICK_DRAG_PX) return;
                  e.stopPropagation();
                  editor?.onWall?.(s.key);
                }}
              >
                <boxGeometry args={[hitSx, h + 0.2, hitSz]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

function DeskMesh({
  desk,
  agentId,
  life,
  onClick,
}: {
  desk: OfficeViewProps["desks"][number];
  agentId?: string;
  life: { current: Map<string, LifeState> };
  onClick?: () => void;
}) {
  const [wx, , wz] = gridToWorld(desk.x, desk.y);
  const screenRef = useRef<MeshStandardMaterial>(null);
  const lightRef = useRef<PointLight>(null);

  useFrame(() => {
    const act = agentId ? life.current.get(agentId)?.activity : undefined;
    const on = act === "work";
    if (screenRef.current) {
      screenRef.current.emissiveIntensity = on ? 3.4 : 0;
      screenRef.current.color.set(on ? "#67e8f9" : "#020617");
    }
    if (lightRef.current) lightRef.current.intensity = on ? 2.4 : 0;
  });

  return (
    <group
      position={[wx, 0.2, wz]}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      <Voxel position={[0, 0.34, 0]} size={[1.05, 0.12, 0.62]} color="#b45309" />
      <Voxel position={[-0.42, 0.14, -0.22]} size={[0.1, 0.28, 0.1]} color="#78350f" />
      <Voxel position={[0.42, 0.14, -0.22]} size={[0.1, 0.28, 0.1]} color="#78350f" />
      <Voxel position={[-0.42, 0.14, 0.22]} size={[0.1, 0.28, 0.1]} color="#78350f" />
      <Voxel position={[0.42, 0.14, 0.22]} size={[0.1, 0.28, 0.1]} color="#78350f" />
      <Voxel position={[0, 0.42, 0.08]} size={[0.42, 0.04, 0.22]} color="#27272a" />
      <Voxel position={[0, 0.62, -0.22]} size={[0.58, 0.46, 0.1]} color="#18181b" />
      <mesh position={[0, 0.62, -0.16]}>
        <boxGeometry args={[0.5, 0.36, 0.04]} />
        <meshStandardMaterial
          ref={screenRef}
          color="#020617"
          emissive="#22d3ee"
          emissiveIntensity={0}
          roughness={0.35}
        />
      </mesh>
      <pointLight
        ref={lightRef}
        position={[0, 0.85, 0.1]}
        color="#67e8f9"
        intensity={0}
        distance={3.2}
      />
      <Voxel position={[0, 0.22, 0.48]} size={[0.34, 0.1, 0.34]} color="#44403c" />
      <Voxel position={[0, 0.42, 0.58]} size={[0.34, 0.34, 0.08]} color="#292524" />
    </group>
  );
}

function RoomLabels() {
  return (
    <>
      {ROOM_RECTS.map((room) => {
        const x = (room.minX + room.maxX) / 2;
        const y = room.minY + 0.15;
        const [wx, , wz] = gridToWorld(x, y);
        return (
          <Html
            key={room.id}
            position={[wx, 1.72, wz]}
            center
            zIndexRange={OFFICE_HTML_Z}
            style={{ pointerEvents: "none" }}
          >
            <span className="iso-room-label">{room.id}</span>
          </Html>
        );
      })}
    </>
  );
}

function WorkFocus({
  agents,
  statuses,
  life,
}: {
  agents: OfficeViewProps["agents"];
  statuses: Record<string, string | undefined>;
  life: { current: Map<string, LifeState> };
}) {
  const tmp = useRef(new Vector3());
  const controls = useThree((s) => s.controls) as { target: Vector3; update: () => void } | null;

  useFrame((_, dt) => {
    if (!controls?.target) return;
    const workers = agents.filter((a) => {
      const act = life.current.get(a.id)?.activity;
      return act === "work" || act === "meet" || statuses[a.id] === "working";
    });
    if (!workers.length) return;
    const meeting = workers.some((a) => life.current.get(a.id)?.activity === "meet");
    if (meeting) {
      const w = gridToWorld(PLANNING_TABLE.x, PLANNING_TABLE.y);
      controls.target.lerp(tmp.current.set(w[0], 0.55, w[2]), 1 - Math.exp(-1.1 * dt));
      controls.update();
      return;
    }
    let x = 0;
    let z = 0;
    for (const a of workers) {
      const d = a.desk ?? { x: 4, y: 4 };
      const w = gridToWorld(d.x, d.y);
      x += w[0];
      z += w[2];
    }
    x /= workers.length;
    z /= workers.length;
    controls.target.lerp(tmp.current.set(x, 0.55, z), 1 - Math.exp(-1.1 * dt));
    controls.update();
  });
  return null;
}

function OfficeSim({
  agents,
  desks,
  selectedAgentId,
  onSelectAgent,
  agentStatuses = {},
  events = [],
  inPlanning = false,
  hideDesks = false,
}: OfficeViewProps & { hideDesks?: boolean }) {
  const life = useRef(new Map<string, LifeState>());

  useFrame((state, dt) => {
    simulateOfficeLife(life.current, agents, agentStatuses, state.clock.elapsedTime, dt, inPlanning);
  });

  const agentsByDesk = new Map(
    agents.filter((a) => a.desk).map((a) => [`${a.desk!.x}-${a.desk!.y}`, a]),
  );

  return (
    <>
      {!hideDesks &&
        desks.map((desk) => {
        const agent = agentsByDesk.get(`${desk.x}-${desk.y}`);
        return (
          <DeskMesh
            key={desk.id}
            desk={desk}
            agentId={agent?.id}
            life={life}
            onClick={agent ? () => onSelectAgent?.(agent.id) : undefined}
          />
        );
      })}

      {agents.map((agent) => {
        const status = agentStatuses[agent.id] ?? agent.status;
        const grid = agentGridPos(agent, status, desks, agents, events);
        const [wx, wy, wz] = gridToWorld(grid.x, grid.y);
        return (
          <VoxelPerson
            key={agent.id}
            agent={agent}
            status={status}
            selected={selectedAgentId === agent.id}
            target={[wx, wy, wz]}
            lifeRef={life}
            onClick={() => onSelectAgent?.(agent.id)}
          />
        );
      })}

      <WorkFocus agents={agents} statuses={agentStatuses} life={life} />
    </>
  );
}

export function Office3D({
  agents,
  desks,
  selectedAgentId,
  onSelectAgent,
  agentStatuses = {},
  events = [],
  onShift = false,
  inPlanning = false,
  blueprint,
  editor,
}: OfficeViewProps) {
  const [hover, setHover] = useState<HoverTile | null>(null);
  const editing = Boolean(editor?.enabled);

  return (
    <div className="office-stage office-stage-3d">
      <Canvas
        shadows
        camera={{ position: [12, 10, 13], fov: 36, near: 0.1, far: 80 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#7eb6e8"]} />
        <fog attach="fog" args={["#93c5e8", 22, 42]} />
        <Sky sunPosition={[8, 10, 4]} turbidity={3.2} rayleigh={0.45} />
        <hemisphereLight args={["#fff7ed", "#4d7c0f", 0.75]} />
        <directionalLight
          castShadow
          position={[8, 14, 6]}
          intensity={1.7}
          shadow-mapSize={[1024, 1024]}
          shadow-camera-far={30}
          shadow-camera-left={-14}
          shadow-camera-right={14}
          shadow-camera-top={14}
          shadow-camera-bottom={-14}
        />
        <ambientLight intensity={0.32} />

        <Voxel position={[0, -0.12, 0]} size={[42, 0.24, 42]} color="#16a34a" />

        <FloorTiles blueprint={blueprint} editor={editor} onHover={setHover} />
        <Walls blueprint={blueprint} editor={editor} />
        {blueprint ? (
          <BlueprintObjects objects={blueprint.objects} includeDesks={editing} />
        ) : (
          <OfficeFurniture />
        )}
        <RoomLabels />

        <OfficeSim
          agents={agents}
          desks={desks}
          selectedAgentId={selectedAgentId}
          onSelectAgent={editing ? undefined : onSelectAgent}
          agentStatuses={agentStatuses}
          events={events}
          onShift={onShift}
          inPlanning={inPlanning}
          hideDesks={editing}
        />

        {editing && hover && editor && (
          <GhostPreview
            x={hover.x}
            y={hover.y}
            kind={editor.tool}
            color={editor.color}
            edge={hover.edge}
            yaw={editor.yaw ?? 0}
            erase={
              editor.tool === "erase" && blueprint
                ? erasePreviewAt(blueprint, hover.x, hover.y, hover.edge)
                : undefined
            }
          />
        )}

        <ContactShadows position={[0, 0.22, 0]} opacity={0.28} scale={22} blur={2.2} far={5} />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={6}
          maxDistance={24}
          maxPolarAngle={Math.PI / 2.12}
          target={[0, 0.55, 0]}
          mouseButtons={
            editing
              ? { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }
              : { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }
          }
        />
      </Canvas>
      <p className="office-hint">
        {editing
          ? "Click places · drag to look · R rotates · erase: click wall or tile edge"
          : "Drag to look around · click a teammate"}
      </p>
    </div>
  );
}
