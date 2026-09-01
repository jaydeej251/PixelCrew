import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="font-semibold">{PRODUCT_NAME}</span>
          <Link href="/app">
            <Button>Open app</Button>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          Your AI company, visible.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-400">
          Hire a team by role. Watch them work in parallel on a professional office floor.
          Bring your own OpenRouter, Gemini, or Ollama keys.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link href="/app">
            <Button className="px-6 py-3">Get started</Button>
          </Link>
          <Link href="/pricing">
            <Button variant="secondary" className="px-6 py-3">
              Pricing
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
