import Link from "next/link";
import { FREE_RUNS_PER_MONTH, PRODUCT_NAME } from "@/lib/constants";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

const FAQ = [
  {
    q: `What does ${PRODUCT_NAME} build in this beta?`,
    a: "A static web app you can open in a browser preview and download as HTML or a ZIP. You watch the office plan and write files, approve the plan, then use the deliverable.",
  },
  {
    q: "Is this a production / hosted app?",
    a: "Not in this beta. There is no live deploy of the generated app yet. Hosted production apps are the roadmap. Today you get preview + ZIP only.",
  },
  {
    q: "Can I change an app after it finishes?",
    a: "Yes — use Request changes on the Done banner. Your current app stays on screen until you Start; Cancel keeps it. Starting counts as a new monthly run.",
  },
  {
    q: "What if my prompt or plan was wrong?",
    a: "On the plan screen, choose Wrong direction — start over. After a run fails or finishes, use Restart with a new brief. Cancel keeps your current app until you Start the redesign.",
  },
  {
    q: "Is there a guide if I get stuck?",
    a: `Yes. New signups land on How it works. Returning users can open How it works or FAQ anytime from the account menu in the office.`,
  },
  {
    q: "How do API keys work?",
    a: "Bring your own OpenRouter, Anthropic, Gemini, or Ollama key. Add it in Settings, then Test before Start so demos do not die on Unauthorized.",
  },
  {
    q: "How many runs do I get?",
    a: `Free beta includes ${FREE_RUNS_PER_MONTH} new runs per calendar month. Resuming a failed or cancelled chat does not consume an extra run. New chats (including Request changes / restart) do.`,
  },
] as const;

export default function FaqPage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <SiteHeader narrow />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-bold">FAQ</h1>
        <p className="mt-2 text-zinc-400">
          Honest answers for the {PRODUCT_NAME} free beta — what works today, and what does not.
        </p>
        <ul className="mt-10 space-y-6">
          {FAQ.map((item) => (
            <li key={item.q} className="border-b border-zinc-800/80 pb-6 last:border-0">
              <h2 className="text-base font-medium text-zinc-100">{item.q}</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{item.a}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-zinc-500">
          Prefer a checklist?{" "}
          <Link href="/onboarding" className="text-zinc-300 hover:text-zinc-100">
            How it works
          </Link>
          {" · "}
          <Link href="/support" className="text-zinc-300 hover:text-zinc-100">
            Support
          </Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
