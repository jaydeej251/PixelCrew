"use client";

import Link from "next/link";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel";

const EXAMPLES = [
  "Personal budget tracker with monthly spend vs budget",
  "Habit tracker with streaks and daily check-ins",
  "Simple CRM for freelance client leads",
];

export const WELCOME_TIPS_DISMISS_KEY = "pixelcrew.welcome-tips.dismissed";

type WelcomePanelProps = {
  onPickExample: (goal: string) => void;
  onDismiss: () => void;
};

/** First-run only tips — keep short so the Start composer stays on screen. */
export function WelcomePanel({ onPickExample, onDismiss }: WelcomePanelProps) {
  return (
    <Panel className="mb-2 border-zinc-700/80 bg-zinc-950/90">
      <PanelHeader>
        <PanelTitle>Your office is ready</PanelTitle>
      </PanelHeader>
      <PanelContent className="space-y-2">
        <p className="text-xs leading-snug text-zinc-400">
          Add a key, Test, describe what to build, approve the plan, then open a static preview.
          {" "}
          <Link href="/onboarding" className="text-zinc-200 underline-offset-2 hover:underline">
            How it works
          </Link>
          {" · "}
          <Link href="/faq" className="text-zinc-200 underline-offset-2 hover:underline">
            FAQ
          </Link>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => onPickExample(ex)}
              className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-left text-[11px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
            >
              {ex.length > 36 ? `${ex.slice(0, 34)}…` : ex}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[11px] text-zinc-500 hover:text-zinc-300"
        >
          Dismiss tips
        </button>
      </PanelContent>
    </Panel>
  );
}
