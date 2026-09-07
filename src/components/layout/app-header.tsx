"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronDown, CircleHelp, LogOut, Settings, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/layout/brand-mark";
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
  resumeLabel?: string;
  onOpenSettings: () => void;
  onLogout: () => void;
  onSimulate?: () => void;
  simulating?: boolean;
  onOpenChats?: () => void;
  onOpenFiles?: () => void;
  filesCount?: number;
  /** Free beta run usage, e.g. 2 of 5 this month. */
  runUsage?: { used: number; limit: number; canRun: boolean } | null;
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
  resumeLabel = "Resume",
  onOpenSettings,
  onLogout,
  onSimulate,
  simulating = false,
  onOpenChats,
  onOpenFiles,
  filesCount = 0,
  runUsage = null,
}: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const chip = statusChip(runOutcome, running);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const displayName = userName?.trim() || userEmail?.split("@")[0] || "Account";
  const initials = displayName.slice(0, 1).toUpperCase();

  return (
    // z-40 keeps the account menu above the office canvas (sibling uses relative).
    <header className="relative z-40 shrink-0 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
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
          <BrandMark
            href="/app"
            size="sm"
            showBeta
            priority
            className="shrink-0"
            wordmarkClassName="hidden font-medium sm:inline"
          />
          <span className="hidden h-4 w-px bg-zinc-800 sm:block" />
          <p className="hidden truncate text-sm text-zinc-500 sm:block">{workspaceName}</p>
        </div>

        <div className="flex items-center gap-1.5">
          {runUsage && (
            <span
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium tabular-nums",
                runUsage.canRun
                  ? "hidden bg-zinc-900 text-zinc-400 sm:inline"
                  : "bg-amber-500/15 text-amber-200",
              )}
              title="New runs this calendar month (resumes do not count)"
            >
              {runUsage.canRun
                ? `${runUsage.used}/${runUsage.limit} runs`
                : `${runUsage.used}/${runUsage.limit}`}
            </span>
          )}

          {chip && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium sm:px-2.5",
                chip.className,
              )}
            >
              {(running || runOutcome === "running") && (
                <span className="size-1.5 animate-pulse rounded-full bg-indigo-400" />
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
              {resumeLabel}
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
              aria-expanded={menuOpen}
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-300">
                {initials}
              </span>
              <span className="hidden max-w-[7rem] truncate text-xs text-zinc-400 md:inline">
                {displayName}
              </span>
              <ChevronDown size={14} className="text-zinc-500" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-zinc-800 bg-zinc-950 py-1 shadow-xl">
                <p className="truncate px-3 py-2 text-xs text-zinc-500">{userEmail ?? displayName}</p>
                {runUsage && (
                  <p
                    className={cn(
                      "px-3 pb-2 text-[11px] tabular-nums sm:hidden",
                      runUsage.canRun ? "text-zinc-500" : "text-amber-300",
                    )}
                  >
                    {runUsage.used}/{runUsage.limit} runs this month
                  </p>
                )}
                <Link
                  href="/account"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                  onClick={() => setMenuOpen(false)}
                >
                  <UserRound size={14} />
                  Account
                </Link>
                <Link
                  href="/onboarding"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                  onClick={() => setMenuOpen(false)}
                >
                  <CircleHelp size={14} />
                  How it works
                </Link>
                <Link
                  href="/faq"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                  onClick={() => setMenuOpen(false)}
                >
                  <BookOpen size={14} />
                  FAQ
                </Link>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenSettings();
                  }}
                >
                  <Settings size={14} />
                  Settings
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-300 hover:bg-zinc-800"
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
