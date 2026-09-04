"use client";

import type { AgentStatus } from "@prisma/client";
import { statusToAnimation } from "@/lib/office";
import { shade } from "./iso";
import { cn } from "@/lib/utils";
import { isQaEngineer } from "./office-life";

type CharacterSpriteProps = {
  name: string;
  color: string;
  status: AgentStatus;
  position?: string;
  selected?: boolean;
  onClick?: () => void;
};

function poseOf(status: AgentStatus) {
  const anim = statusToAnimation(status);
  if (anim === "typing") return "type";
  if (anim === "walking") return "walk";
  if (anim === "blocked") return "stuck";
  return "idle";
}

function poseLabel(pose: string, position?: string) {
  if (pose === "type" && position && isQaEngineer(position)) return " · reviewing";
  if (pose === "type") return " · coding";
  if (pose === "walk") return " · walking";
  if (pose === "stuck") return " · stuck";
  return "";
}

export function CharacterSprite({
  name,
  color,
  status,
  position,
  selected,
  onClick,
}: CharacterSpriteProps) {
  const pose = poseOf(status);
  const hair = shade(color, -40);
  const body = color;
  const first = name.split(" ")[0];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "office-sprite",
        pose === "walk" && "is-walk",
        pose === "type" && "is-type",
        pose === "stuck" && "is-stuck",
        selected && "is-selected",
      )}
      aria-label={`${name}, ${pose}`}
    >
      <span className="office-shadow" />
      <span className="office-legs">
        <span className="office-leg left" />
        <span className="office-leg right" />
      </span>
      <span className="office-body" style={{ background: body, borderColor: shade(color, -50) }} />
      <span className="office-head">
        <span className="office-hair" style={{ background: hair }} />
        <span className="office-face">
          <span className="office-eye" />
          <span className="office-eye" />
        </span>
      </span>
      {pose === "type" && <span className="office-code-dots" aria-hidden />}
      {pose === "stuck" && <span className="office-stuck-mark">?</span>}
      {pose === "walk" && <span className="office-doc" aria-hidden />}
      <span className="office-nametag">
        {first}
        {poseLabel(pose, position)}
      </span>
    </button>
  );
}
