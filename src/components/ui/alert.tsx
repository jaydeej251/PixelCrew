import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type AlertVariant = "error" | "success" | "info" | "warning";

const variants: Record<AlertVariant, string> = {
  error: "border-red-900/50 bg-red-950/90 text-red-200 backdrop-blur-md",
  success:
    "border-emerald-800/70 bg-emerald-950/95 text-emerald-100 shadow-lg shadow-black/40 backdrop-blur-md",
  info: "border-zinc-700 bg-zinc-950/90 text-zinc-300 backdrop-blur-md",
  warning: "border-amber-800/60 bg-amber-950/90 text-amber-100 backdrop-blur-md",
};

export function Alert({
  variant = "info",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: AlertVariant }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 text-sm leading-relaxed",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
