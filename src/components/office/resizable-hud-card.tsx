"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

const FULL_HEIGHT_CSS = "calc(100dvh - 5.5rem)";

export type ResizableHudDefault = "full" | "hug";

type ResizableHudCardProps = {
  storageKey: string;
  /** full = nearly viewport tall; hug = size to content until the user drags. */
  defaultMode?: ResizableHudDefault;
  /**
   * Force content-sized height and hide the resize grip (e.g. “Your app is ready”).
   * Ignores any stored height for this key while active.
   */
  forceHug?: boolean;
  minHeightPx?: number;
  maxHeightCss?: string;
  className?: string;
  bodyClassName?: string;
  resizeLabel?: string;
  children: ReactNode;
};

/**
 * One office HUD card with an optional bottom drag handle.
 * Width is owned by the parent (typically max-w-sm).
 */
export function ResizableHudCard({
  storageKey,
  defaultMode = "hug",
  forceHug = false,
  minHeightPx = 96,
  maxHeightCss = FULL_HEIGHT_CSS,
  className,
  bodyClassName,
  resizeLabel = "Resize panel. Double-click to restore default height.",
  children,
}: ResizableHudCardProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  /** null = use defaultMode (full CSS or hug). */
  const [heightPx, setHeightPx] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const n = Number(raw);
        if (Number.isFinite(n) && n >= minHeightPx) setHeightPx(n);
      }
    } catch {
      /* private mode / quota */
    }
    setHydrated(true);
  }, [storageKey, minHeightPx]);

  const persistHeight = useCallback(
    (px: number) => {
      const next = Math.max(minHeightPx, Math.round(px));
      setHeightPx(next);
      try {
        window.localStorage.setItem(storageKey, String(next));
      } catch {
        /* ignore */
      }
    },
    [minHeightPx, storageKey],
  );

  const onResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH =
        heightPx ?? shellRef.current?.getBoundingClientRect().height ?? minHeightPx;
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const max = Math.max(minHeightPx, window.innerHeight - 72);
        persistHeight(Math.min(max, startH + (ev.clientY - startY)));
      };
      const onUp = (ev: PointerEvent) => {
        target.releasePointerCapture(ev.pointerId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [heightPx, minHeightPx, persistHeight],
  );

  const resetDefault = useCallback(() => {
    setHeightPx(null);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const hugging = forceHug || (heightPx == null && defaultMode === "hug");
  const useStoredPx = !forceHug && hydrated && heightPx != null;
  const useFullDefault =
    !forceHug && !useStoredPx && defaultMode === "full";

  return (
    <div
      ref={shellRef}
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/80 shadow-lg backdrop-blur-md",
        className,
      )}
      style={
        useStoredPx
          ? { height: heightPx, maxHeight: maxHeightCss }
          : useFullDefault
            ? { height: maxHeightCss, maxHeight: maxHeightCss }
            : hugging
              ? { maxHeight: maxHeightCss }
              : { maxHeight: maxHeightCss }
      }
    >
      <div className={cn("min-h-0 flex-1 overflow-y-auto px-3 py-2", bodyClassName)}>
        {children}
      </div>

      {!forceHug ? (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={resizeLabel}
          title="Drag to resize · double-click for default height"
          className="group flex h-3 shrink-0 cursor-ns-resize items-center justify-center border-t border-zinc-800/80 bg-zinc-950/90 hover:bg-zinc-900"
          onPointerDown={onResizePointerDown}
          onDoubleClick={resetDefault}
        >
          <span className="h-0.5 w-8 rounded-full bg-zinc-600 group-hover:bg-zinc-400" />
        </div>
      ) : null}
    </div>
  );
}

export const RUN_YOU_ASKED_HEIGHT_KEY = "pixelcrew:hud-you-asked-height";
export const RUN_ACTIVITY_HEIGHT_KEY = "pixelcrew:hud-activity-height";
