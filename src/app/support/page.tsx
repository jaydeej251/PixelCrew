import { PRODUCT_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export default function SupportPage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <SiteHeader narrow />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-bold">Support</h1>
        <p className="mt-2 text-zinc-400">
          Free beta — if a run breaks or keys fail, tell us. We read every message.
        </p>
        <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <p className="text-sm text-zinc-500">Email</p>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`${PRODUCT_NAME} beta support`)}`}
            className="mt-1 inline-block text-lg text-indigo-300 hover:text-indigo-200"
          >
            {SUPPORT_EMAIL}
          </a>
          <p className="mt-4 text-sm text-zinc-500">
            Include what you tried (provider, model, and whether Test key passed). Never paste
            full API keys in email.
          </p>
        </div>
        <p className="mt-6 text-sm text-zinc-500">
          Prefer in-app controls? Open{" "}
          <a href="/account" className="text-zinc-400 hover:text-zinc-200">
            Account
          </a>{" "}
          to log out or delete data — visiting Support never signs you out.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
