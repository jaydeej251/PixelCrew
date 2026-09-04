import { PRODUCT_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <SiteHeader narrow />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-bold">Terms of use (beta)</h1>
        <p className="mt-2 text-sm text-zinc-500">Last updated: 4 September 2026 · Free beta</p>
        <div className="mt-8 space-y-4 text-sm leading-relaxed text-zinc-400">
          <p>
            {PRODUCT_NAME} is an early beta product. By creating an account you agree to use the
            service lawfully and not to abuse rate limits, other users, or third-party APIs.
          </p>
          <p>
            You bring your own API keys (BYOK). You are responsible for those keys, their billing
            with providers (OpenRouter, Ollama, Google, etc.), and content generated with them.
          </p>
          <p>
            We provide the product “as is” during beta. Features may change; uptime and output
            quality are not guaranteed. Do not rely on {PRODUCT_NAME} for critical production
            systems without your own review.
          </p>
          <p>
            We may suspend accounts that abuse the free run allowance or attempt unauthorized
            access to other tenants.
          </p>
          <p>
            Questions:{" "}
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
