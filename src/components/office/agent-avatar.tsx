"use client";

import { motion } from "framer-motion";
import type { AgentStatus } from "@prisma/client";
import { cn } from "@/lib/utils";
import { statusToAnimation } from "@/lib/office";

type AgentAvatarProps = {
  name: string;
  color: string;
  status: AgentStatus;
  selected?: boolean;
  onClick?: () => void;
  size?: "sm" | "md";
  showLabel?: boolean;
};

export function AgentAvatar({
  name,
  color,
  status,
  selected,
  onClick,
  size = "md",
  showLabel = true,
}: AgentAvatarProps) {
  const anim = statusToAnimation(status);
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  const motionProps = {
    className: cn(
      "relative flex flex-col items-center gap-1",
      onClick && "cursor-pointer",
    ),
    animate:
      anim === "typing"
        ? { y: [0, -2, 0] }
        : anim === "walking"
          ? { x: [0, 4, 0] }
          : anim === "blocked"
            ? { rotate: [0, -3, 3, 0] }
            : {},
    transition: { repeat: anim !== "idle" ? Infinity : 0, duration: 1.2 },
  };

  const inner = (
    <>
      <div
        className={cn(
          "flex items-center justify-center rounded-full font-semibold text-white ring-2",
          size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm",
          selected ? "ring-indigo-400" : "ring-zinc-700",
        )}
        style={{ backgroundColor: color }}
      >
        {initials}
      </div>
      {showLabel && (
        <span className="max-w-[72px] truncate text-[10px] text-zinc-400">{name.split(" ")[0]}</span>
      )}
      {anim === "typing" && (
        <span className="absolute -right-1 -top-1 flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1 w-1 rounded-full bg-emerald-400"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
            />
          ))}
        </span>
      )}
      {anim === "blocked" && (
        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400" />
      )}
    </>
  );

  if (onClick) {
    return (
      <motion.button type="button" onClick={onClick} {...motionProps}>
        {inner}
      </motion.button>
    );
  }

  return <motion.div {...motionProps}>{inner}</motion.div>;
}
