"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRODUCT_NAME } from "@/lib/constants";
import { SHOW_DEV_TOOLS } from "@/lib/dev-tools";
import { cn } from "@/lib/utils";

type AppHeaderProps = {
  workspaceName: string;
  userEmail?: string;
  userName?: string | null;
  running: boolean;
  runOutcome: "idle" | "running" | "paused" | "completed" | "failed";
  onCancel: () => void;
  onResume?: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  onSimulate?: () => void;
  simulating?: boolean;
  onOpenChats?: () => void;
  onOpenFiles?: () => void;
  filesCount?: number;
};

function statusChip(outcome: AppHeaderProps["runOutcome"], running: boolean) {
  if (running || outcome === "running") {
    return { label: "Building", className: "bg-indigo-500/15 text-indigo-200" };
  }
  if (outcome === "paused") {
    return { label: "Your turn", className: "bg-amber-500/15 text-amber-200" };
  }
  if (outcome === "completed") {
    return { label: "Ready", className: "bg-emerald-500/15 text-emerald-200" };
  }
  if (outcome === "failed") {
    return { label: "Needs attention", className: "bg-red-500/15 text-red-200" };
  }
  return null;
}

export function AppHeader({
  workspaceName,
  userEmail,
  userName,
  running,
  runOutcome,
  onCancel,
  onResume,
  onOpenSettings,
  onLogout,
  onSimulate,
  simulating = false,
  onOpenChats,
  onOpenFiles,
  filesCount = 0,
}: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const chip = statusChip(runOutcome, running);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const displayName = userName?.trim() || userEmail?.split("@")[0] || "Account";
  const initials = displayName.slice(0, 1).toUpperCase();

  return (
    <header className="shrink-0 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
      <div className="flex h-12 items-center justify-between gap-3 px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          {onOpenChats && (
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 lg:hidden"
              onClick={onOpenChats}
            >
              Chats
            </button>
          )}
          <Link href="/app" className="flex items-center gap-2 shrink-0">
            <span className="flex size-7 items-center justify-center rounded-md bg-indigo-500/20 text-xs font-semibold text-indigo-300">
              P
            </span>
            <span className="hidden font-medium text-zinc-100 sm:inline">{PRODUCT_NAME}</span>
          </Link>
          <span className="hidden h-4 w-px bg-zinc-800 sm:block" />
          <p className="hidden truncate text-sm text-zinc-500 sm:block">{workspaceName}</p>
        </div>

        <div className="flex items-center gap-1.5">
          {chip && (
            <span
              className={cn(
                "hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium sm:inline-flex",
                chip.className,
              )}
            >
              {(running || runOutcome === "running") && (
                <span className="size-1.5 rounded-full bg-indigo-400 animate-pulse" />
              )}
              {chip.label}
            </span>
          )}

          {onOpenFiles && (
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 lg:hidden"
              onClick={onOpenFiles}
            >
              Files{filesCount > 0 ? ` (${filesCount})` : ""}
            </button>
          )}

          {running && (
            <Button variant="ghost" type="button" className="!h-8 !px-3 text-red-300" onClick={onCancel}>
              Stop
            </Button>
          )}

          {!running && runOutcome === "failed" && onResume && (
            <Button variant="primary" type="button" className="!h-8 !px-3" onClick={onResume}>
              Resume
            </Button>
          )}

          {SHOW_DEV_TOOLS && onSimulate && (
            <Button
              variant="ghost"
              type="button"
              onClick={onSimulate}
              disabled={simulating || running}
              className="hidden !h-8 sm:inline-flex"
            >
              {simulating ? "Simulating…" : "Simulate"}
            </Button>
          )}

          <Button
            variant="ghost"
            type="button"
            className="!h-8 !px-2"
            onClick={onOpenSettings}
            aria-label="Settings"
          >
            <Settings size={16} />
          </Button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 p-0.5 pr-2 text-sm text-zinc-200 hover:border-zinc-700"
              aria-label="Account menu"
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-300">
                {initials}
              </span>
              <ChevronDown size={14} className="hidden text-zinc-500 sm:block" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-zinc-800 bg-zinc-950 py-1">
                <p className="truncate px-3 py-2 text-xs text-zinc-500">{userEmail ?? displayName}</p>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                  onClick={() => {
                    setMenuOpen(false);
                    onLogout();
                  }}
                >
                  <LogOut size={14} />
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
