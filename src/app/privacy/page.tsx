import Link from "next/link";
import { PRODUCT_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { SiteFooter } from "@/components/layout/site-footer";

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <Link href="/" className="font-semibold">
            {PRODUCT_NAME}
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-bold">Privacy (beta)</h1>
        <p className="mt-2 text-sm text-zinc-500">Last updated: 4 September 2026 · Free beta</p>
        <div className="mt-8 space-y-4 text-sm leading-relaxed text-zinc-400">
          <p>
            We store your account email, workspace data (agents, runs, artifacts), and encrypted
            API credentials you save in the app. Session cookies keep you signed in.
          </p>
          <p>
            API keys you paste are encrypted at rest. We do not sell your keys. Provider calls
            use your keys to generate plans and files — those providers process prompts under
            their own policies.
          </p>
          <p>
            Previews are isolated from your app APIs. We use standard hosting and database
            providers to run the service.
          </p>
          <p>
            To delete your account and associated workspace data, use{" "}
            <Link href="/account" className="text-indigo-400 hover:text-indigo-300">
              Account
            </Link>{" "}
            while signed in, or email{" "}
            <a className="text-indigo-400 hover:text-indigo-300" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
