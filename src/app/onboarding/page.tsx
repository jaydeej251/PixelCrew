"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { PRODUCT_NAME } from "@/lib/constants";

const STEPS = [
  {
    title: "Paste a full Ollama Cloud key",
    body: "From ollama.com/settings/keys — the full id.secret value. Incomplete keys are rejected.",
  },
  {
    title: "Use cloud + pick a model chip",
    body: "Settings → Use on the cloud credential, then choose gpt-oss:20b (no -cloud suffix).",
  },
  {
    title: "Test key before Start",
    body: "The office checklist requires a green chat probe so demos don’t die on Unauthorized.",
  },
  {
    title: "Run → approve plan → Preview + Download",
    body: "That is Launch A. We do not claim live deploy or GitHub PR yet.",
  },
] as const;

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <span className="font-semibold">{PRODUCT_NAME} — Golden demo path</span>
      </header>
      <main className="mx-auto max-w-lg px-6 py-12">
        <Panel>
          <PanelHeader>
            <PanelTitle>First run checklist</PanelTitle>
          </PanelHeader>
          <PanelContent className="space-y-4">
            <p className="text-sm text-zinc-400">
              Open the office and finish these steps in Settings (or the checklist above
              Start). Mock still works for a floor walkthrough — use a real key for the
              client demo.
            </p>
            <ol className="space-y-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                  <p className="text-sm font-medium text-zinc-100">
                    {index + 1}. {step.title}
                  </p>
                  <p className="mt-1 text-xs leading-snug text-zinc-500">{step.body}</p>
                </li>
              ))}
            </ol>
            <Link href="/app">
              <Button className="w-full">Open office</Button>
            </Link>
            <p className="text-center text-[11px] text-zinc-600">
              Already signed in? The same checklist appears above Start on the floor.
            </p>
          </PanelContent>
        </Panel>
      </main>
    </div>
  );
}
