"use client";

import { gridToWorld, CELL } from "./office-layout";
import {
  edgeLine,
  objectShowsFacing,
  type OfficeObject,
  type TileEdge,
} from "@/lib/office-blueprint";

function Box({
  position,
  size,
  color,
  emissive,
  emissiveIntensity = 0,
  opacity = 1,
  pickable = true,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  pickable?: boolean;
}) {
  return (
    <mesh position={position} castShadow receiveShadow raycast={pickable ? undefined : () => null}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={0.82}
        metalness={0.04}
        emissive={emissive ?? "#000000"}
        emissiveIntensity={emissiveIntensity}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
}

/** Chevron pointing local −Z (north at yaw 0). */
function FacingMarker({ opacity = 1 }: { opacity?: number }) {
  return (
    <group>
      <Box position={[0, 0.1, -0.48]} size={[0.22, 0.06, 0.14]} color="#fbbf24" opacity={opacity} />
      <Box position={[0, 0.1, -0.62]} size={[0.1, 0.06, 0.14]} color="#f59e0b" opacity={opacity} />
    </group>
  );
}

function LayoutObjectMesh({
  obj,
  ghost = false,
}: {
  obj: { kind: string; color?: string; yaw?: number };
  ghost?: boolean;
}) {
  const color = obj.color ?? "#a8a29e";
  const opacity = ghost ? 0.45 : 1;
  const kind = obj.kind;

  if (kind === "desk") {
    return (
      <group>
        <Box position={[0, 0.34, 0]} size={[1.05, 0.12, 0.62]} color={color} opacity={opacity} />
        <Box position={[-0.42, 0.14, -0.22]} size={[0.1, 0.28, 0.1]} color="#78350f" opacity={opacity} />
        <Box position={[0.42, 0.14, -0.22]} size={[0.1, 0.28, 0.1]} color="#78350f" opacity={opacity} />
        <Box position={[-0.42, 0.14, 0.22]} size={[0.1, 0.28, 0.1]} color="#78350f" opacity={opacity} />
        <Box position={[0.42, 0.14, 0.22]} size={[0.1, 0.28, 0.1]} color="#78350f" opacity={opacity} />
        <Box position={[0, 0.62, -0.22]} size={[0.58, 0.46, 0.1]} color="#18181b" opacity={opacity} />
        <Box position={[0, 0.22, 0.48]} size={[0.34, 0.1, 0.34]} color="#44403c" opacity={opacity} />
      </group>
    );
  }
  if (kind === "computer") {
    return (
      <group>
        <Box position={[0, 0.28, 0]} size={[0.42, 0.08, 0.28]} color="#27272a" opacity={opacity} />
        <Box
          position={[0, 0.52, -0.04]}
          size={[0.5, 0.36, 0.06]}
          color="#0ea5e9"
          emissive="#22d3ee"
          emissiveIntensity={ghost ? 0.1 : 0.4}
          opacity={opacity}
        />
      </group>
    );
  }
  if (kind === "chair") {
    return (
      <group>
        <Box position={[0, 0.22, 0]} size={[0.32, 0.08, 0.32]} color={color} opacity={opacity} />
        <Box position={[0, 0.42, 0.12]} size={[0.32, 0.36, 0.06]} color="#292524" opacity={opacity} />
      </group>
    );
  }
  if (kind === "conference") {
    return (
      <group>
        <Box position={[0, 0.42, 0]} size={[2.15, 0.1, 1.05]} color={color} opacity={opacity} />
        <Box position={[-0.9, 0.22, -0.38]} size={[0.1, 0.32, 0.1]} color="#78350f" opacity={opacity} />
        <Box position={[0.9, 0.22, -0.38]} size={[0.1, 0.32, 0.1]} color="#78350f" opacity={opacity} />
        <Box position={[-0.9, 0.22, 0.38]} size={[0.1, 0.32, 0.1]} color="#78350f" opacity={opacity} />
        <Box position={[0.9, 0.22, 0.38]} size={[0.1, 0.32, 0.1]} color="#78350f" opacity={opacity} />
      </group>
    );
  }
  if (kind === "table") {
    return <Box position={[0, 0.32, 0]} size={[0.7, 0.22, 0.7]} color={color} opacity={opacity} />;
  }
  if (kind === "whiteboard") {
    return (
      <group>
        <Box position={[0, 1.15, 0]} size={[1.6, 1.05, 0.08]} color={color} opacity={opacity} />
        <Box position={[-0.35, 1.2, 0.05]} size={[0.28, 0.22, 0.02]} color="#f97316" opacity={opacity} />
        <Box position={[0.2, 1.05, 0.05]} size={[0.28, 0.22, 0.02]} color="#38bdf8" opacity={opacity} />
      </group>
    );
  }
  if (kind === "tv") {
    return (
      <group>
        <Box position={[0, 1.15, 0]} size={[0.1, 0.85, 1.35]} color="#18181b" opacity={opacity} />
        <Box
          position={[-0.04, 1.15, 0]}
          size={[0.04, 0.7, 1.18]}
          color="#0ea5e9"
          emissive="#22d3ee"
          emissiveIntensity={ghost ? 0.15 : 0.5}
          opacity={opacity}
        />
      </group>
    );
  }
  if (kind === "plant") {
    return (
      <group>
        <Box position={[0, 0.12, 0]} size={[0.1, 0.22, 0.1]} color="#5c4033" opacity={opacity} />
        <Box position={[0, 0.32, 0]} size={[0.22, 0.22, 0.22]} color="#16a34a" opacity={opacity} />
        <Box position={[0.1, 0.5, 0]} size={[0.16, 0.16, 0.16]} color="#22c55e" opacity={opacity} />
      </group>
    );
  }
  if (kind === "cooler") {
    return (
      <group>
        <Box position={[0, 0.42, 0]} size={[0.28, 0.5, 0.28]} color={color} opacity={opacity} />
        <Box
          position={[0, 0.72, 0]}
          size={[0.22, 0.22, 0.22]}
          color="#7dd3fc"
          emissive="#38bdf8"
          emissiveIntensity={0.2}
          opacity={opacity}
        />
      </group>
    );
  }
  if (kind === "counter") {
    return (
      <group>
        <Box position={[0, 0.48, 0]} size={[1.6, 0.42, 0.42]} color="#d6d3d1" opacity={opacity} />
        <Box position={[0, 0.72, 0]} size={[1.7, 0.08, 0.48]} color={color} opacity={opacity} />
      </group>
    );
  }
  if (kind === "rug") {
    return <Box position={[0, 0.22, 0]} size={[1.4, 0.04, 1.1]} color={color} opacity={opacity} />;
  }
  return <Box position={[0, 0.3, 0]} size={[0.4, 0.4, 0.4]} color={color} opacity={opacity} />;
}

function WallGhost({
  x,
  y,
  edge,
  color,
  opacity,
}: {
  x: number;
  y: number;
  edge: TileEdge;
  color: string;
  opacity: number;
}) {
  const line = edgeLine(x, y, edge);
  if (line.axis === "h") {
    const midX = (line.b0 + line.b1) / 2;
    const [wx, , wz] = gridToWorld(midX, line.a);
    return (
      <Box
        position={[wx, 0.9, wz]}
        size={[CELL * 0.96, 1.3, 0.16]}
        color={color}
        opacity={opacity}
        pickable={false}
      />
    );
  }
  const midY = (line.b0 + line.b1) / 2;
  const [wx, , wz] = gridToWorld(line.a, midY);
  return (
    <Box
      position={[wx, 0.9, wz]}
      size={[0.16, 1.3, CELL * 0.96]}
      color={color}
      opacity={opacity}
      pickable={false}
    />
  );
}

export function BlueprintObjects({
  objects,
  includeDesks,
}: {
  objects: Array<{
    id: string;
    kind: string;
    x: number;
    y: number;
    color?: string;
    yaw?: number;
    label?: string;
  }>;
  includeDesks: boolean;
}) {
  return (
    <group>
      {objects.map((obj) => {
        if (!includeDesks && obj.kind === "desk") return null;
        const [wx, , wz] = gridToWorld(obj.x, obj.y);
        return (
          <group key={obj.id} position={[wx, 0.2, wz]} rotation={[0, obj.yaw ?? 0, 0]}>
            <LayoutObjectMesh obj={obj} />
            {includeDesks && objectShowsFacing(obj.kind) ? <FacingMarker /> : null}
          </group>
        );
      })}
    </group>
  );
}

export function GhostPreview({
  x,
  y,
  kind,
  color,
  edge = "n",
  yaw = 0,
  erase,
}: {
  x: number;
  y: number;
  kind: string;
  color: string;
  edge?: TileEdge;
  yaw?: number;
  erase?: { hasObject: boolean; hasWall: boolean; hasFloor: boolean };
}) {
  const [wx, , wz] = gridToWorld(x, y);
  if (kind === "floor") {
    return (
      <Box
        position={[wx, 0.24, wz]}
        size={[CELL * 0.96, 0.08, CELL * 0.96]}
        color={color}
        opacity={0.45}
        pickable={false}
      />
    );
  }
  if (kind === "wall") {
    return <WallGhost x={x} y={y} edge={edge} color={color} opacity={0.4} />;
  }
  if (kind === "erase") {
    const hasObject = erase?.hasObject ?? false;
    const hasWall = erase?.hasWall ?? false;
    const hasFloor = erase?.hasFloor ?? false;
    const willErase = hasObject || hasWall || hasFloor;
    return (
      <group>
        {(hasObject || hasFloor) && (
          <Box
            position={[wx, 0.24, wz]}
            size={[CELL * 0.96, 0.08, CELL * 0.96]}
            color={hasObject ? "#ef4444" : "#f87171"}
            opacity={hasObject ? 0.4 : 0.28}
            pickable={false}
          />
        )}
        {hasWall && !hasObject && (
          <WallGhost x={x} y={y} edge={edge} color="#ef4444" opacity={0.5} />
        )}
        {!willErase && (
          <Box
            position={[wx, 0.24, wz]}
            size={[CELL * 0.7, 0.06, CELL * 0.7]}
            color="#71717a"
            opacity={0.22}
            pickable={false}
          />
        )}
      </group>
    );
  }
  const obj: OfficeObject = {
    id: "ghost",
    kind: kind as OfficeObject["kind"],
    x,
    y,
    color,
    yaw,
  };
  return (
    <group position={[wx, 0.2, wz]} rotation={[0, yaw, 0]}>
      <LayoutObjectMesh obj={obj} ghost />
      {objectShowsFacing(kind) ? <FacingMarker opacity={0.55} /> : null}
    </group>
  );
}
