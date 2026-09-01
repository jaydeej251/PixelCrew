import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel";

const PLANS = [
  { name: "Free", price: "$0", runs: "5 runs/mo", features: ["Mock agents", "1 workspace", "Simulate run"] },
  { name: "Pro", price: "$29", runs: "100 runs/mo", features: ["BYOK", "Parallel agents", "Export zip", "Usage tracking"] },
  { name: "Enterprise", price: "Contact", runs: "Unlimited", features: ["SSO", "Audit log", "Self-host", "Priority support"] },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/" className="font-semibold">
            {PRODUCT_NAME}
          </Link>
          <Link href="/app">
            <Button variant="secondary">Open app</Button>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="text-center text-3xl font-bold">Pricing</h1>
        <p className="mt-2 text-center text-zinc-400">Bring your own API keys. We charge for the office.</p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => (
            <Panel key={plan.name}>
              <PanelHeader>
                <PanelTitle>{plan.name}</PanelTitle>
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
      </main>
    </div>
  );
}
