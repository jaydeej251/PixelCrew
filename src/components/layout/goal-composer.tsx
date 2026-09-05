"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ArrowUp } from "lucide-react";

const EXAMPLES = [
  "Personal budget tracker with monthly spend vs budget",
  "Habit tracker with streaks and daily check-ins",
  "Simple CRM for freelance client leads",
];

type GoalComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  submitting?: boolean;
  showExamples?: boolean;
  compact?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  submitLabel?: string;
};

export function GoalComposer({
  value,
  onChange,
  onSubmit,
  disabled = false,
  submitting = false,
  showExamples = false,
  compact = false,
  autoFocus = false,
  placeholder = "What should we build?",
  submitLabel = "Start",
}: GoalComposerProps) {
  const canSubmit = value.trim().length > 0 && !disabled && !submitting;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const maxHeight = compact ? 112 : 220;

  useEffect(() => {
    if (!autoFocus) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [autoFocus]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [value, maxHeight]);

  return (
    <div className={compact ? "w-full" : "mx-auto w-full max-w-2xl"}>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/90 p-2 shadow-lg ring-1 ring-white/5 backdrop-blur-md focus-within:border-indigo-500/40">
        <textarea
          ref={textareaRef}
          className={
            compact
              ? "max-h-28 min-h-[56px] w-full resize-none overflow-y-auto bg-transparent px-3 py-2 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
              : "max-h-[220px] min-h-[96px] w-full resize-none overflow-y-auto bg-transparent px-3 py-2.5 text-[15px] leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          }
          rows={compact ? 2 : 4}
          value={value}
          disabled={disabled || submitting}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        <div className="flex items-center justify-between gap-3 px-2 pb-1">
          <p className="hidden text-[11px] text-zinc-600 sm:block">⌘ or Ctrl + Enter to start</p>
          <Button
            type="button"
            className="!rounded-full !px-4"
            onClick={onSubmit}
            disabled={!canSubmit}
          >
            {submitting ? (
              <>
                <Spinner className="size-3.5" />
                Starting…
              </>
            ) : (
              <>
                {submitLabel}
                <ArrowUp size={14} />
              </>
            )}
          </Button>
        </div>
      </div>

      {showExamples && (
        <div className={compact ? "mt-2" : "mt-4"}>
          {!compact && <p className="mb-2 text-center text-xs text-zinc-500">Or try an example</p>}
          <div className={`flex flex-wrap gap-2 ${compact ? "" : "justify-center"}`}>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => onChange(ex)}
                className="rounded-full border border-zinc-800 bg-zinc-900/40 px-3 py-1.5 text-left text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
