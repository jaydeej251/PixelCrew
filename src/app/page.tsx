import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="auth-grid min-h-screen text-zinc-100">
      <header className="border-b border-zinc-800/80 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-500/20 text-sm text-indigo-300">
              P
            </span>
            {PRODUCT_NAME}
          </span>
          <div className="flex gap-2">
            <Link href="/login">
              <Button variant="ghost">Log in</Button>
            </Link>
            <Link href="/signup">
              <Button>Get started</Button>
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-50 sm:text-5xl">
          Your AI company, visible.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-400">
          Hire a team by role. Watch them walk to their desks, write a plan, and drop files you
          can preview. Bring your own OpenRouter, Gemini, or Ollama keys.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/signup">
            <Button className="min-w-[160px] px-6 py-3">Create free account</Button>
          </Link>
          <Link href="/login">
            <Button variant="secondary" className="min-w-[160px] px-6 py-3">
              Log in
            </Button>
          </Link>
        </div>
        <p className="mt-8 text-sm text-zinc-500">
          <Link href="/pricing" className="text-zinc-400 hover:text-zinc-200">
            View pricing
          </Link>
        </p>
      </main>
    </div>
  );
}
