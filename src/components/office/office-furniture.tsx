"use client";

import { gridToWorld, PLANNING_SEATS, PLANNING_TABLE } from "./office-layout";

function Box({
  position,
  size,
  color,
  emissive,
  emissiveIntensity = 0,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  emissive?: string;
  emissiveIntensity?: number;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={0.82}
        metalness={0.04}
        emissive={emissive ?? "#000000"}
        emissiveIntensity={emissiveIntensity}
      />
    </mesh>
  );
}

function MeetingChair({ x, y }: { x: number; y: number }) {
  const [wx, , wz] = gridToWorld(x, y);
  const [tx, , tz] = gridToWorld(PLANNING_TABLE.x, PLANNING_TABLE.y);
  const yaw = Math.atan2(tx - wx, tz - wz);
  return (
    <group position={[wx, 0.2, wz]} rotation={[0, yaw, 0]}>
      <Box position={[0, 0.22, 0.02]} size={[0.32, 0.08, 0.32]} color="#44403c" />
      <Box position={[0, 0.42, 0.14]} size={[0.32, 0.36, 0.06]} color="#292524" />
    </group>
  );
}

function WaitingChair({ x, y, yaw = 0 }: { x: number; y: number; yaw?: number }) {
  const [wx, , wz] = gridToWorld(x, y);
  return (
    <group position={[wx, 0.2, wz]} rotation={[0, yaw, 0]}>
      <Box position={[0, 0.2, 0]} size={[0.34, 0.08, 0.34]} color="#7c2d12" />
      <Box position={[0, 0.38, 0.14]} size={[0.34, 0.32, 0.06]} color="#9a3412" />
    </group>
  );
}

export function OfficeFurniture() {
  const [tableX, , tableZ] = gridToWorld(PLANNING_TABLE.x, PLANNING_TABLE.y);
  const [boardX, , boardZ] = gridToWorld(2.55, 0.72);
  const [tvX, , tvZ] = gridToWorld(4.55, 1.7);
  const [rugX, , rugZ] = gridToWorld(6.7, 7.55);
  const [coffeeX, , coffeeZ] = gridToWorld(6.55, 7.7);
  const [coolX, , coolZ] = gridToWorld(5.1, 3.15);
  const [counterX, , counterZ] = gridToWorld(6.55, 6.55);
  const [matX, , matZ] = gridToWorld(6.5, 8.28);

  return (
    <group>
      {/* Planning — conference table */}
      <Box position={[tableX, 0.42, tableZ]} size={[2.15, 0.1, 1.05]} color="#b45309" />
      <Box position={[tableX - 0.9, 0.22, tableZ - 0.38]} size={[0.1, 0.32, 0.1]} color="#78350f" />
      <Box position={[tableX + 0.9, 0.22, tableZ - 0.38]} size={[0.1, 0.32, 0.1]} color="#78350f" />
      <Box position={[tableX - 0.9, 0.22, tableZ + 0.38]} size={[0.1, 0.32, 0.1]} color="#78350f" />
      <Box position={[tableX + 0.9, 0.22, tableZ + 0.38]} size={[0.1, 0.32, 0.1]} color="#78350f" />
      <Box position={[tableX, 0.5, tableZ]} size={[0.55, 0.04, 0.35]} color="#e7e5e4" />
      {PLANNING_SEATS.map((s) => (
        <MeetingChair key={`${s.x}-${s.y}`} x={s.x} y={s.y} />
      ))}

      {/* Whiteboard on the north wall */}
      <Box position={[boardX, 1.15, boardZ]} size={[2.35, 1.15, 0.06]} color="#f8fafc" />
      <Box position={[boardX, 1.15, boardZ + 0.02]} size={[2.2, 1.0, 0.02]} color="#e2e8f0" />
      <Box position={[boardX - 0.55, 1.25, boardZ + 0.04]} size={[0.28, 0.22, 0.02]} color="#f97316" />
      <Box position={[boardX - 0.15, 1.05, boardZ + 0.04]} size={[0.28, 0.22, 0.02]} color="#38bdf8" />
      <Box position={[boardX + 0.35, 1.28, boardZ + 0.04]} size={[0.28, 0.22, 0.02]} color="#a3e635" />
      <Box position={[boardX + 0.7, 1.08, boardZ + 0.04]} size={[0.22, 0.18, 0.02]} color="#f472b6" />

      {/* TV / projector on the east wall */}
      <Box position={[tvX, 1.22, tvZ]} size={[0.08, 0.85, 1.45]} color="#18181b" />
      <Box
        position={[tvX - 0.04, 1.22, tvZ]}
        size={[0.03, 0.72, 1.28]}
        color="#0ea5e9"
        emissive="#22d3ee"
        emissiveIntensity={0.55}
      />
      <Box position={[tvX, 1.85, tvZ]} size={[0.18, 0.08, 0.28]} color="#27272a" />

      {/* Reception waiting area + front counter */}
      <Box position={[rugX, 0.22, rugZ]} size={[1.7, 0.04, 1.35]} color="#7c2d12" />
      <WaitingChair x={6.2} y={7.85} yaw={0} />
      <WaitingChair x={6.7} y={7.85} yaw={0} />
      <WaitingChair x={7.2} y={7.85} yaw={-0.2} />
      <Box position={[coffeeX, 0.32, coffeeZ]} size={[0.55, 0.22, 0.55]} color="#a8a29e" />
      <Box position={[coffeeX, 0.46, coffeeZ]} size={[0.16, 0.08, 0.16]} color="#fafafa" />
      <Box position={[coffeeX + 0.14, 0.46, coffeeZ + 0.1]} size={[0.12, 0.06, 0.12]} color="#7f1d1d" />

      {/* Reception counter facing the front door */}
      <Box position={[counterX, 0.48, counterZ]} size={[1.85, 0.42, 0.42]} color="#d6d3d1" />
      <Box position={[counterX, 0.72, counterZ]} size={[1.9, 0.08, 0.48]} color="#e7e5e4" />
      <Box position={[counterX - 0.55, 0.82, counterZ]} size={[0.35, 0.12, 0.22]} color="#a8a29e" />

      {/* Welcome mat at the front door */}
      <Box position={[matX, 0.22, matZ]} size={[1.05, 0.03, 0.55]} color="#44403c" />

      {/* Hall water cooler */}
      <Box position={[coolX, 0.42, coolZ]} size={[0.28, 0.5, 0.28]} color="#e2e8f0" />
      <Box position={[coolX, 0.72, coolZ]} size={[0.22, 0.22, 0.22]} color="#7dd3fc" emissive="#38bdf8" emissiveIntensity={0.25} />
    </group>
  );
}
