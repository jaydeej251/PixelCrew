import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type BadgeVariant = "default" | "planning" | "building" | "done" | "failed";

const variants: Record<BadgeVariant, string> = {
  default: "bg-zinc-800 text-zinc-300",
  planning: "bg-amber-500/20 text-amber-200",
  building: "bg-indigo-500/20 text-indigo-200",
  done: "bg-emerald-500/20 text-emerald-200",
  failed: "bg-red-500/20 text-red-200",
};

export function Badge({
  variant = "default",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function runStatusBadgeVariant(status: string): BadgeVariant {
  if (status === "paused") return "planning";
  if (status === "running" || status === "pending") return "building";
  if (status === "completed") return "done";
  if (status === "failed" || status === "cancelled") return "failed";
  return "default";
}

export function runStatusLabel(status: string): string {
  if (status === "paused") return "Planning";
  if (status === "running" || status === "pending") return "Building";
  if (status === "completed") return "Done";
  if (status === "cancelled") return "Stopped";
  if (status === "failed") return "Failed";
  return status;
}
