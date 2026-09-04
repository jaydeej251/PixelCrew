import Link from "next/link";
import { FREE_RUNS_PER_MONTH, SUPPORT_EMAIL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export default function Home() {
  return (
    <div className="auth-grid flex min-h-screen flex-col text-zinc-100">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-16 text-center sm:py-20">
        <p className="text-xs font-medium uppercase tracking-wide text-amber-200/90">
          Free beta · {FREE_RUNS_PER_MONTH} runs / month · bring your own keys
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-zinc-50 sm:text-5xl">
          Your AI company, visible.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-400">
          Watch an AI company plan and write files. You approve the plan. You preview and
          download a zip. Charge for the office — not tokens (BYOK).
        </p>
        <div className="mx-auto mt-8 max-w-xl rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-left text-sm text-zinc-400">
          <p className="font-medium text-zinc-200">What works today</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Office floor, planning council, plan review, project files, preview + zip</li>
            <li>Your OpenRouter, Gemini, or Ollama keys (local or cloud)</li>
          </ul>
          <p className="mt-3 font-medium text-zinc-200">Not in this beta</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Live deploy, GitHub PR delivery, or paid checkout</li>
            <li>Claiming agents ran real shell tools in a sandbox</li>
          </ul>
        </div>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/app">
            <Button className="min-w-[160px] px-6 py-3">Open office</Button>
          </Link>
          <Link href="/signup">
            <Button variant="secondary" className="min-w-[160px] px-6 py-3">
              Create free account
            </Button>
          </Link>
        </div>
        <p className="mt-8 text-sm text-zinc-500">
          <Link href="/pricing" className="text-zinc-400 hover:text-zinc-200">
            View pricing
          </Link>
          {" · "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-zinc-400 hover:text-zinc-200">
            Contact
          </a>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
