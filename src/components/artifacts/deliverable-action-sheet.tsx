"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type DeliverableActionMode = "follow-up" | "redesign";

type DeliverableActionSheetProps = {
  open: boolean;
  mode: DeliverableActionMode;
  priorBrief: string;
  /** Prefill for redesign; empty for follow-up. Remount via key when opening. */
  initialDraft: string;
  onClose: () => void;
  onStart: (goalText: string) => void;
  busy?: boolean;
  error?: string;
  canStart?: boolean;
  canStartReason?: string | null;
  usageBlockedReason?: string | null;
  onOpenSettings?: () => void;
};

export function DeliverableActionSheet({
  open,
  mode,
  priorBrief,
  initialDraft,
  onClose,
  onStart,
  busy = false,
  error = "",
  canStart = true,
  canStartReason = null,
  usageBlockedReason = null,
  onOpenSettings,
}: DeliverableActionSheetProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(initialDraft);

  const isFollowUp = mode === "follow-up";
  const title = isFollowUp ? "Request changes" : "Restart with a new brief";
  const submitLabel = isFollowUp ? "Start changes" : "Start redesign";
  const placeholder = isFollowUp
    ? "What should change? e.g. darker theme, add export…"
    : "Rewrite what you want to build…";

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const blockedReason = usageBlockedReason || (!canStart ? canStartReason : null);
  const canSubmit = draft.trim().length > 0 && !busy && !blockedReason;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-3 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label="Cancel and keep current app"
        disabled={busy}
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative z-10 flex max-h-[min(90dvh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-950 shadow-2xl",
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold text-zinc-100">
              {title}
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
              Your current app stays available until you start.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
            aria-label="Cancel"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {isFollowUp && priorBrief.trim() && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Current app
              </p>
              <p className="mt-0.5 line-clamp-4 text-sm text-zinc-300">{priorBrief}</p>
            </div>
          )}

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              {isFollowUp ? "Changes you want" : "New brief"}
            </span>
            <textarea
              ref={inputRef}
              className="min-h-[120px] w-full resize-y rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500/40 focus:outline-none disabled:opacity-60"
              value={draft}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit) {
                  e.preventDefault();
                  onStart(draft.trim());
                }
              }}
            />
          </label>

          {blockedReason && (
            <p className="text-[12px] text-amber-400/90">
              {blockedReason}{" "}
              {onOpenSettings && !usageBlockedReason && (
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-amber-300"
                  onClick={onOpenSettings}
                >
                  Open settings
                </button>
              )}
            </p>
          )}

          {error && <p className="text-[12px] text-red-300">{error}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-zinc-800 px-4 py-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => onStart(draft.trim())}
            disabled={!canSubmit}
          >
            {busy ? (
              <>
                <Spinner className="size-3.5" />
                Starting…
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
