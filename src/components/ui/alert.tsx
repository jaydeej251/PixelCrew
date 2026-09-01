import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type AlertVariant = "error" | "success" | "info";

const variants: Record<AlertVariant, string> = {
  error: "border-red-900/50 bg-red-950/30 text-red-200",
  success: "border-emerald-900/40 bg-emerald-950/20 text-emerald-200",
  info: "border-zinc-700 bg-zinc-900/60 text-zinc-300",
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
