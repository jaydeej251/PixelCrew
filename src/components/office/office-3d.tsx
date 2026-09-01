"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Html, OrbitControls, Sky } from "@react-three/drei";
import { PointLight, Vector3, type MeshStandardMaterial } from "three";
import { OFFICE_ROOMS } from "@/lib/constants";
import {
  CELL,
  GRID_MAX,
  GRID_MIN,
  ROOM_HEX,
  agentGridPos,
  buildingWalls,
  cellRoom,
  gridToWorld,
  type OfficeViewProps,
} from "./office-layout";
import { simulateOfficeLife, type LifeState } from "./office-life";
import { VoxelPerson } from "./voxel-person";

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

function FloorTiles({ desks }: { desks: OfficeViewProps["desks"] }) {
  const tiles = useMemo(() => {
    const list: Array<{ key: string; x: number; y: number; room: string }> = [];
    for (let y = GRID_MIN; y <= GRID_MAX; y++) {
      for (let x = GRID_MIN; x <= GRID_MAX; x++) {
        list.push({ key: `${x}-${y}`, x, y, room: cellRoom(x, y, desks) });
      }
    }
    return list;
  }, [desks]);

  return (
    <group>
      {tiles.map((t) => {
        const [cx, , cz] = gridToWorld(t.x, t.y);
        const colors = ROOM_HEX[t.room] ?? ROOM_HEX.hall;
        const hex = (t.x + t.y) % 2 === 0 ? colors[0] : colors[1];
        const grass = t.room === "grass";
        return (
          <Voxel
            key={t.key}
            position={[cx, grass ? 0.05 : 0.1, cz]}
            size={[CELL * 0.98, grass ? 0.22 : 0.2, CELL * 0.98]}
            color={hex}
          />
        );
      })}
    </group>
  );
}

function Walls() {
  const segs = useMemo(() => buildingWalls(), []);
  return (
    <group>
      {segs.map((s) => {
        const h = s.kind === "doorpost" ? 1.58 : 1.42;
        const y = 0.22 + h / 2;
        return (
          <Voxel
            key={s.key}
            position={[s.wx, y, s.wz]}
            size={[Math.max(s.sx, 0.08), h, Math.max(s.sz, 0.08)]}
            color={s.color}
          />
        );
      })}
    </group>
  );
}

function Plant({ x, y }: { x: number; y: number }) {
  const [wx, , wz] = gridToWorld(x, y);
  return (
    <group position={[wx, 0.2, wz]}>
      <Voxel position={[0, 0.12, 0]} size={[0.1, 0.22, 0.1]} color="#5c4033" />
      <Voxel position={[0, 0.32, 0]} size={[0.22, 0.22, 0.22]} color="#16a34a" />
      <Voxel position={[0.12, 0.5, 0]} size={[0.16, 0.16, 0.16]} color="#22c55e" />
      <Voxel position={[-0.08, 0.48, 0.08]} size={[0.14, 0.14, 0.14]} color="#15803d" />
    </group>
  );
}

function HallSet() {
  const [wx, , wz] = gridToWorld(4.5, 4.36);
  return (
    <group position={[wx, 0.2, wz]}>
      <Voxel position={[0, 0.22, 0]} size={[0.85, 0.18, 0.45]} color="#a8a29e" />
      <Voxel position={[-0.18, 0.36, 0]} size={[0.12, 0.1, 0.12]} color="#fafafa" />
      <Voxel position={[0.18, 0.36, 0]} size={[0.12, 0.1, 0.12]} color="#7f1d1d" />
    </group>
  );
}

function DeskMesh({
  desk,
  agentId,
  life,
  statuses,
  onClick,
}: {
  desk: OfficeViewProps["desks"][number];
  agentId?: string;
  life: { current: Map<string, LifeState> };
  statuses: Record<string, string | undefined>;
  onClick?: () => void;
}) {
  const [wx, , wz] = gridToWorld(desk.x, desk.y);
  const screenRef = useRef<MeshStandardMaterial>(null);
  const lightRef = useRef<PointLight>(null);

  useFrame(() => {
    const act = agentId ? life.current.get(agentId)?.activity : undefined;
    const on = act === "work" || (agentId ? statuses[agentId] === "working" : false);
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

function RoomLabels({ desks }: { desks: OfficeViewProps["desks"] }) {
  return (
    <>
      {OFFICE_ROOMS.map((room) => {
        const inRoom = desks.filter((d) => d.room === room);
        if (inRoom.length === 0) return null;
        const x = inRoom.reduce((s, d) => s + d.x, 0) / inRoom.length;
        const y = Math.min(...inRoom.map((d) => d.y)) - 0.55;
        const [wx, , wz] = gridToWorld(x, y);
        return (
          <Html key={room} position={[wx, 1.72, wz]} center style={{ pointerEvents: "none" }}>
            <span className="iso-room-label">{room}</span>
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
      return act === "work" || statuses[a.id] === "working";
    });
    if (!workers.length) return;
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
  onShift = false,
}: OfficeViewProps) {
  const life = useRef(new Map<string, LifeState>());

  useFrame((state, dt) => {
    simulateOfficeLife(life.current, agents, agentStatuses, state.clock.elapsedTime, dt, onShift);
  });

  const agentsByDesk = new Map(
    agents.filter((a) => a.desk).map((a) => [`${a.desk!.x}-${a.desk!.y}`, a]),
  );

  return (
    <>
      {desks.map((desk) => {
        const agent = agentsByDesk.get(`${desk.x}-${desk.y}`);
        return (
          <DeskMesh
            key={desk.id}
            desk={desk}
            agentId={agent?.id}
            life={life}
            statuses={agentStatuses}
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
}: OfficeViewProps) {
  const plants = useMemo(() => {
    const list: Array<{ x: number; y: number }> = [];
    for (let y = GRID_MIN; y <= GRID_MAX; y++) {
      for (let x = GRID_MIN; x <= GRID_MAX; x++) {
        if (cellRoom(x, y, desks) === "grass" && (x + y) % 4 === 0 && x > 0 && y > 0) {
          list.push({ x, y });
        }
      }
    }
    return list;
  }, [desks]);

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

        <FloorTiles desks={desks} />
        <Walls />
        <HallSet />
        {plants.map((p) => (
          <Plant key={`${p.x}-${p.y}`} x={p.x} y={p.y} />
        ))}
        <RoomLabels desks={desks} />

        <OfficeSim
          agents={agents}
          desks={desks}
          selectedAgentId={selectedAgentId}
          onSelectAgent={onSelectAgent}
          agentStatuses={agentStatuses}
          events={events}
          onShift={onShift}
        />

        <ContactShadows position={[0, 0.22, 0]} opacity={0.28} scale={22} blur={2.2} far={5} />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={6}
          maxDistance={24}
          maxPolarAngle={Math.PI / 2.12}
          target={[0, 0.55, 0]}
        />
      </Canvas>
      <p className="office-hint">Drag to look around · click a teammate</p>
    </div>
  );
}
