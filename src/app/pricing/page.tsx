import Link from "next/link";
import { PRODUCT_NAME, FREE_RUNS_PER_MONTH } from "@/lib/constants";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

const PLANS = [
  {
    name: "Free beta",
    price: "$0",
    runs: `${FREE_RUNS_PER_MONTH} new runs / month`,
    features: [
      "BYOK (OpenRouter, Gemini, Ollama)",
      "Office + planning council",
      "Plan approve → files → preview + zip",
      "1 workspace",
    ],
    available: true,
  },
  {
    name: "Pro",
    price: "Planned",
    runs: "Paid checkout is not available yet",
    features: ["Higher run limits", "Usage tracking", "Priority support (planned)"],
    available: false,
  },
  {
    name: "Enterprise",
    price: "Roadmap",
    runs: "Not currently available",
    features: ["SSO", "Audit log", "Self-host"],
    available: false,
  },
] as const;

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
        <h1 className="text-center text-3xl font-bold">Pricing</h1>
        <p className="mt-2 text-center text-zinc-400">
          Bring your own API keys. Paid plans are not for sale yet — Free beta is what you get.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => (
            <Panel
              key={plan.name}
              className={plan.available ? "border-indigo-500/40" : undefined}
            >
              <PanelHeader>
                <PanelTitle className="flex items-center gap-2">
                  {plan.name}
                  {plan.available && (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                      Available
                    </span>
                  )}
                </PanelTitle>
              </PanelHeader>
              <PanelContent>
                <p className="text-3xl font-bold">{plan.price}</p>
                <p className="text-sm text-zinc-500">{plan.runs}</p>
                <ul className="mt-4 space-y-2 text-sm text-zinc-400">
                  {plan.features.map((f) => (
                    <li key={f}>• {f}</li>
                  ))}
                </ul>
              </PanelContent>
            </Panel>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-zinc-600">
          <Link href="/" className="hover:text-zinc-300">
            ← Back to {PRODUCT_NAME}
          </Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
