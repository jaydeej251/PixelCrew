import Image from "next/image";
import Link from "next/link";
import { FREE_RUNS_PER_MONTH } from "@/lib/constants";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { HomeHeroActions } from "@/components/layout/home-hero-actions";

const TRUTHS = ["Hire by role", "Watch the floor", "You approve"] as const;

const PILLARS = [
  {
    label: "Org",
    title: "Specialists, not one chat",
    body: "Staff a company by role — product, design, engineering, QA — instead of one generic assistant.",
  },
  {
    label: "Office",
    title: "A floor you can watch",
    body: "See agents move to desks, plan together, and write files on a living isometric office.",
  },
  {
    label: "You",
    title: "Approve before they build",
    body: "Review the plan first. Then preview the project and download a zip — you stay in control.",
  },
] as const;

export default function Home() {
  return (
    <div className="auth-grid flex min-h-screen flex-col text-zinc-100">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-12 sm:py-16">
        <section className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          <div className="text-center lg:text-left">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-200/90">
              Free beta · {FREE_RUNS_PER_MONTH} runs / month · bring your own keys
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-zinc-50 sm:text-5xl">
              Your AI company, visible.
            </h1>
            <p className="mt-3 text-lg font-medium text-zinc-200">
              The company is the product.{" "}
              <span className="text-zinc-400">Org. Office. You.</span>
            </p>
            <p className="mx-auto mt-4 max-w-xl text-base text-zinc-400 lg:mx-0">
              Watch an AI company plan and write files. You approve the plan. You preview and
              download a zip. Charge for the office — not tokens (BYOK).
            </p>
            <ul className="mx-auto mt-6 flex max-w-md flex-col gap-2 text-left text-sm text-zinc-300 lg:mx-0">
              {TRUTHS.map((truth) => (
                <li key={truth} className="flex items-center gap-3">
                  <span className="size-1.5 shrink-0 rounded-sm bg-cyan-400" aria-hidden />
                  {truth}
                </li>
              ))}
            </ul>
            <HomeHeroActions />
          </div>
          <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
            <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/40 shadow-2xl shadow-black/40">
              <Image
                src="/marketing/office.png"
                alt="Isometric PixelCrew office floor with agents at their desks"
                width={1200}
                height={900}
                className="h-auto w-full"
                priority
              />
            </div>
          </div>
        </section>

        <section className="mt-16 sm:mt-20">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-zinc-50">
            The company is the product.
          </h2>
          <p className="mt-2 text-center text-sm text-zinc-500">Org. Office. You.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {PILLARS.map((pillar) => (
              <article
                key={pillar.label}
                className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-5 text-left"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                  {pillar.label}
                </p>
                <h3 className="mt-2 text-base font-medium text-zinc-100">{pillar.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">{pillar.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-2xl rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-left text-sm text-zinc-400">
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
        </section>

        <p className="mt-8 text-center text-sm text-zinc-500">
          <Link href="/pricing" className="text-zinc-400 hover:text-zinc-200">
            View pricing
          </Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
