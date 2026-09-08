"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ScrollHudCardProps = {
  title: string;
  children: ReactNode;
  /** Cap height; content scrolls inside. */
  maxHeightCss?: string;
  className?: string;
};

/**
 * Fixed-cap HUD card: sticky title + scrollable body. No resize grip.
 * Prefer this for recap panels (completed prompt / what was built).
 */
export function ScrollHudCard({
  title,
  children,
  maxHeightCss = "min(32vh, 280px)",
  className,
}: ScrollHudCardProps) {
  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/80 shadow-lg backdrop-blur-md",
        className,
      )}
      style={{ maxHeight: maxHeightCss }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
        <p className="sticky top-0 z-[1] -mx-3 mb-1.5 border-b border-zinc-800/80 bg-zinc-950/95 px-3 pb-1.5 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 backdrop-blur-sm">
          {title}
        </p>
        {children}
      </div>
    </section>
  );
}
