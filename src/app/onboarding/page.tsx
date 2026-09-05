import Link from "next/link";
import { FREE_RUNS_PER_MONTH, PRODUCT_NAME } from "@/lib/constants";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { buttonClassName } from "@/components/ui/button";

const STEPS = [
  {
    title: "Add an API key in Settings",
    body: "Bring your own OpenRouter, Gemini, or Ollama key (local or cloud). Paste the full secret — incomplete keys are rejected.",
  },
  {
    title: "Test the key before you Start",
    body: "The checklist above Start requires a green probe so the run does not die on Unauthorized mid-demo.",
  },
  {
    title: "Describe what to build",
    body: "Type a clear goal. The office staffs a planning council; you review the plan before anyone writes files.",
  },
  {
    title: "Approve the plan, then open your app",
    body: "When the team finishes, open a static preview in a new tab or download ZIP/HTML. That is Launch A for this beta.",
  },
] as const;

export default function OnboardingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <SiteHeader narrow />
      <main className="mx-auto w-full max-w-lg flex-1 px-6 py-12">
        <Panel>
          <PanelHeader>
            <PanelTitle>First-run guide</PanelTitle>
          </PanelHeader>
          <PanelContent className="space-y-4">
            <p className="text-sm text-zinc-400">
              Watch an AI company plan and ship project files. You bring the keys, approve the
              plan, then preview and download. Free beta includes {FREE_RUNS_PER_MONTH} new runs
              per month.
            </p>
            <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs leading-snug text-zinc-500">
              Beta deliverable is a <span className="text-zinc-300">static preview + ZIP</span> —
              not a hosted production deploy. Production apps are the roadmap, not this release.
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
            <Link href="/app" className={buttonClassName("primary", "w-full")}>
              Open office
            </Link>
            <p className="text-center text-[11px] text-zinc-600">
              Returning later? Open How it works anytime from the account menu, or read the{" "}
              <Link href="/faq" className="text-zinc-400 hover:text-zinc-200">
                FAQ
              </Link>
              . {PRODUCT_NAME} keeps the same checklist above Start on the floor.
            </p>
          </PanelContent>
        </Panel>
      </main>
      <SiteFooter />
    </div>
  );
}
