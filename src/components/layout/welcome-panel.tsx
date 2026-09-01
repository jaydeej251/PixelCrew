"use client";

import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel";

const EXAMPLES = [
  "Personal budget tracker with monthly spend vs budget",
  "Habit tracker with streaks and daily check-ins",
  "Simple CRM for freelance client leads",
];

type WelcomePanelProps = {
  onPickExample: (goal: string) => void;
  isFirstVisit?: boolean;
};

export function WelcomePanel({ onPickExample, isFirstVisit }: WelcomePanelProps) {
  return (
    <Panel className="border-indigo-500/20 bg-indigo-500/5">
      <PanelHeader>
        <PanelTitle>
          {isFirstVisit ? "Your office is ready" : "Start a new chat"}
        </PanelTitle>
      </PanelHeader>
      <PanelContent className="space-y-4">
        <p className="text-sm text-zinc-400">
          Type what you want to build below. Workspace AI will staff a planning council,
          you review the plan, then engineers ship project files you can preview or export.
        </p>
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Try an example
          </p>
          <ul className="space-y-2">
            {EXAMPLES.map((ex) => (
              <li key={ex}>
                <button
                  type="button"
                  onClick={() => onPickExample(ex)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:border-indigo-500/40 hover:bg-zinc-900"
                >
                  {ex}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </PanelContent>
    </Panel>
  );
}
