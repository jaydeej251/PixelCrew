"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { PRODUCT_NAME } from "@/lib/constants";
import { TEAM_TEMPLATES } from "@/lib/templates";

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [template, setTemplate] = useState("startup");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <span className="font-semibold">{PRODUCT_NAME} — Onboarding</span>
      </header>
      <main className="mx-auto max-w-lg px-6 py-12">
        {step === 1 && (
          <Panel>
            <PanelHeader>
              <PanelTitle>Step 1: Pick your team</PanelTitle>
            </PanelHeader>
            <PanelContent className="space-y-2">
              {TEAM_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className={`w-full rounded-lg border p-3 text-left ${
                    template === t.id ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-800"
                  }`}
                >
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-zinc-500">{t.description}</p>
                </button>
              ))}
              <Button className="mt-4 w-full" onClick={() => setStep(2)}>
                Continue
              </Button>
            </PanelContent>
          </Panel>
        )}
        {step === 2 && (
          <Panel>
            <PanelHeader>
              <PanelTitle>Step 2: Add API key (optional)</PanelTitle>
            </PanelHeader>
            <PanelContent>
              <p className="mb-4 text-sm text-zinc-400">
                Skip for now to use mock agents, or add keys in the app settings later.
                Never paste keys in chat.
              </p>
              <Button className="w-full" onClick={() => setStep(3)}>
                Continue
              </Button>
            </PanelContent>
          </Panel>
        )}
        {step === 3 && (
          <Panel>
            <PanelHeader>
              <PanelTitle>Ready!</PanelTitle>
            </PanelHeader>
            <PanelContent>
              <p className="mb-4 text-sm text-zinc-400">
                Your office is set up. Type a CEO goal and hit Run.
              </p>
              <Link href="/app">
                <Button className="w-full">Open office</Button>
              </Link>
            </PanelContent>
          </Panel>
        )}
      </main>
    </div>
  );
}
