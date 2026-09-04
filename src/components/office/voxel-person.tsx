"use client";

import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Group } from "three";
import type { AgentStatus } from "@prisma/client";
import type { OfficeAgent } from "@/lib/office";
import { statusToAnimation } from "@/lib/office";
import { shade } from "./iso";
import {
  activityLabel,
  workBadgeLabel,
  type LifeActivity,
  type LifeState,
} from "./office-life";
import { OFFICE_HTML_Z } from "./office-layout";

/** One Minecraft pixel. Character is 8×32×8 like Steve. */
const U = 0.028;

const SKIN = ["#f1d5b5", "#e0b184", "#c68642", "#8d5524", "#ffdbac"] as const;
const PANTS = ["#1e3a5f", "#292524", "#3f3f46", "#1e293b"] as const;
const SHOES = "#1c1917";

function hashName(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function Box({
  position,
  size,
  color,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.82} metalness={0} />
    </mesh>
  );
}

type LimbRefs = {
  leftArm: Group | null;
  rightArm: Group | null;
  leftLeg: Group | null;
  rightLeg: Group | null;
};

export function VoxelPerson({
  agent,
  status,
  selected,
  target,
  onClick,
  activity,
  lookAt,
  lifeRef,
}: {
  agent: OfficeAgent;
  status: AgentStatus;
  selected: boolean;
  target: [number, number, number];
  onClick: () => void;
  activity?: LifeActivity;
  lookAt?: [number, number];
  lifeRef?: { current: Map<string, LifeState> };
}) {
  const root = useRef<Group>(null);
  const lastAct = useRef<LifeActivity | null>(null);
  const limbs = useRef<LimbRefs>({
    leftArm: null,
    rightArm: null,
    leftLeg: null,
    rightLeg: null,
  });
  const pose = statusToAnimation(status);
  const fallback: LifeActivity =
    activity ??
    (pose === "typing" ? "work" : pose === "walking" ? "walk" : pose === "blocked" ? "stuck" : "stand");
  const [liveAct, setLiveAct] = useState<LifeActivity>(fallback);
  const first = agent.name.split(" ")[0];

  const id = hashName(agent.name);
  const skin = SKIN[id % SKIN.length];
  const pants = PANTS[id % PANTS.length];
  const shirt = agent.avatarColor;
  const hair = shade(agent.avatarColor, -70);
  const hairStyle = id % 4;

  useFrame((state, dt) => {
    const g = root.current;
    if (!g) return;
    const life = lifeRef?.current.get(agent.id);
    const gx = life?.x ?? target[0];
    const gz = life?.z ?? target[2];
    const k = 1 - Math.exp(-10 * dt);
    g.position.x += (gx - g.position.x) * k;
    g.position.z += (gz - g.position.z) * k;

    const act: LifeActivity = life?.activity ?? fallback;
    if (lastAct.current !== act) {
      lastAct.current = act;
      setLiveAct(act);
    }
    const isWalk = act === "walk";
    const isType = act === "work";
    const isWait = act === "wait";
    const isMeet = act === "meet";
    const isStuck = act === "stuck";
    const isTalk = act === "talk" || isMeet;
    const sitY = isType || isWait || isMeet ? 0.24 : 0;
    g.position.y += (sitY - g.position.y) * k;

    const t = state.clock.elapsedTime;
    const { leftArm, rightArm, leftLeg, rightLeg } = limbs.current;
    const swing = isWalk ? Math.sin(t * 9) * 0.85 : 0;

    if (leftArm) {
      leftArm.rotation.x = isType
        ? -1.15 + Math.sin(t * 18) * 0.18
        : isTalk
          ? -0.7 + Math.sin(t * 6) * 0.55
          : isWalk
            ? swing
            : Math.sin(t * 1.4) * 0.06;
    }
    if (rightArm) {
      rightArm.rotation.x = isType
        ? -1.15 + Math.sin(t * 18 + 0.6) * 0.18
        : isTalk
          ? -0.55 + Math.sin(t * 6 + 1.2) * 0.5
          : isWalk
            ? -swing
            : Math.sin(t * 1.4 + 1) * 0.06;
    }
    if (leftLeg) {
      leftLeg.rotation.x = isType || isWait || isMeet ? -Math.PI / 2.15 : isWalk ? -swing : 0;
    }
    if (rightLeg) {
      rightLeg.rotation.x = isType || isWait || isMeet ? -Math.PI / 2.15 : isWalk ? swing : 0;
    }

    const look = life ? ([life.faceX, life.faceZ] as const) : lookAt;
    const dx = look ? look[0] - g.position.x : gx - g.position.x;
    const dz = look ? look[1] - g.position.z : gz - g.position.z;
    const face =
      isTalk || (look && Math.hypot(dx, dz) > 0.05)
        ? Math.atan2(dx, dz)
        : isWalk
          ? Math.atan2(gx - g.position.x, gz - g.position.z)
          : Math.PI;
    const yaw = g.rotation.y;
    let diff = face - yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    g.rotation.y = yaw + diff * k;
    g.rotation.z = isStuck ? Math.sin(t * 12) * 0.08 : 0;
  });

  return (
    <group
      ref={root}
      position={target}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[0.22, 0.3, 4]} />
          <meshBasicMaterial color="#fde68a" />
        </mesh>
      )}
      {liveAct === "work" && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.3, 0.42, 24]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.95} />
        </mesh>
      )}

      <group
        ref={(n) => {
          limbs.current.leftLeg = n;
        }}
        position={[-2 * U, 12 * U, 0]}
      >
        <Box position={[0, -6 * U, 0]} size={[4 * U, 12 * U, 4 * U]} color={pants} />
        <Box position={[0, -12 * U, 1 * U]} size={[4 * U, 2 * U, 5 * U]} color={SHOES} />
      </group>
      <group
        ref={(n) => {
          limbs.current.rightLeg = n;
        }}
        position={[2 * U, 12 * U, 0]}
      >
        <Box position={[0, -6 * U, 0]} size={[4 * U, 12 * U, 4 * U]} color={pants} />
        <Box position={[0, -12 * U, 1 * U]} size={[4 * U, 2 * U, 5 * U]} color={SHOES} />
      </group>

      <Box position={[0, 18 * U, 0]} size={[8 * U, 12 * U, 4 * U]} color={shirt} />

      <group
        ref={(n) => {
          limbs.current.leftArm = n;
        }}
        position={[-6 * U, 22 * U, 0]}
      >
        <Box position={[0, -6 * U, 0]} size={[4 * U, 12 * U, 4 * U]} color={shirt} />
        <Box position={[0, -12 * U, 0]} size={[4 * U, 2 * U, 4 * U]} color={skin} />
      </group>
      <group
        ref={(n) => {
          limbs.current.rightArm = n;
        }}
        position={[6 * U, 22 * U, 0]}
      >
        <Box position={[0, -6 * U, 0]} size={[4 * U, 12 * U, 4 * U]} color={shirt} />
        <Box position={[0, -12 * U, 0]} size={[4 * U, 2 * U, 4 * U]} color={skin} />
      </group>

      <group position={[0, 28 * U, 0]}>
        <Box position={[0, 0, 0]} size={[8 * U, 8 * U, 8 * U]} color={skin} />
        <Box position={[-1.6 * U, 0.8 * U, 4.1 * U]} size={[1.4 * U, 1.4 * U, 0.6 * U]} color="#18181b" />
        <Box position={[1.6 * U, 0.8 * U, 4.1 * U]} size={[1.4 * U, 1.4 * U, 0.6 * U]} color="#18181b" />
        {hairStyle === 0 && (
          <Box position={[0, 4.2 * U, 0]} size={[8.4 * U, 2.2 * U, 8.4 * U]} color={hair} />
        )}
        {hairStyle === 1 && (
          <>
            <Box position={[0, 4 * U, -0.4 * U]} size={[8.2 * U, 2 * U, 8 * U]} color={hair} />
            <Box position={[-3.2 * U, 1 * U, 0]} size={[2 * U, 6 * U, 8.2 * U]} color={hair} />
          </>
        )}
        {hairStyle === 2 && (
          <>
            <Box position={[0, 3.8 * U, 0]} size={[8.2 * U, 1.8 * U, 8.2 * U]} color={hair} />
            <Box position={[0, 6.2 * U, -1 * U]} size={[3.5 * U, 3.5 * U, 3.5 * U]} color={hair} />
          </>
        )}
        {hairStyle === 3 && (
          <>
            <Box position={[0, 4 * U, 0]} size={[8.3 * U, 2 * U, 8.3 * U]} color={hair} />
            <Box position={[0, -1 * U, -4.5 * U]} size={[6 * U, 10 * U, 2 * U]} color={hair} />
          </>
        )}
      </group>

      {liveAct === "stuck" && (
        <Html position={[0.2, 1.05, 0]} center zIndexRange={OFFICE_HTML_Z}>
          <span className="office-stuck-mark">?</span>
        </Html>
      )}
      {liveAct === "work" && (
        <>
          <pointLight position={[0.15, 0.85, 0.35]} intensity={1.8} distance={2.4} color="#67e8f9" />
          <Html
            position={[0, 1.48, 0]}
            center
            distanceFactor={8}
            zIndexRange={OFFICE_HTML_Z}
            style={{ pointerEvents: "none" }}
          >
            <span className="office-coding-badge">{workBadgeLabel(agent.position)}</span>
          </Html>
        </>
      )}
      <Html
        position={[0, 1.12, 0]}
        center
        distanceFactor={9}
        zIndexRange={OFFICE_HTML_Z}
        style={{ pointerEvents: "none" }}
      >
        <span className={liveAct === "work" ? "office-nametag is-coding" : "office-nametag"}>
          {activityLabel(first, liveAct, agent.position)}
        </span>
      </Html>
    </group>
  );
}
