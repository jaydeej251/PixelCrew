"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PRODUCT_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/layout/site-footer";

export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/auth/me");
      if (res.status === 401) {
        router.replace("/login?from=/account");
        return;
      }
      const json = await res.json();
      if (!json.user) {
        router.replace("/login?from=/account");
        return;
      }
      setEmail(json.user.email ?? null);
      setLoading(false);
    })();
  }, [router]);

  const logout = async () => {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const deleteAccount = async () => {
    if (confirmDelete !== "DELETE") {
      setError('Type DELETE to confirm.');
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/delete-account", { method: "POST" });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setError(json?.error ?? "Could not delete account");
      setBusy(false);
      return;
    }
    router.push("/");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="font-semibold">
            {PRODUCT_NAME}
          </Link>
          <Link href="/app">
            <Button variant="ghost">Back to office</Button>
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-bold">Account</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Log out, contact support, or delete your beta account and workspace data.
        </p>

        {loading ? (
          <p className="mt-8 text-sm text-zinc-500">Loading…</p>
        ) : (
          <div className="mt-8 space-y-6">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <p className="text-xs text-zinc-500">Signed in as</p>
              <p className="mt-1 text-sm text-zinc-200">{email}</p>
              <Button
                type="button"
                variant="secondary"
                className="mt-4"
                disabled={busy}
                onClick={() => void logout()}
              >
                Log out
              </Button>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <p className="text-sm font-medium text-zinc-200">Support</p>
              <p className="mt-1 text-sm text-zinc-500">
                Broken run? Email{" "}
                <a className="text-indigo-400 hover:text-indigo-300" href={`mailto:${SUPPORT_EMAIL}`}>
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
            </div>

            <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-5">
              <p className="text-sm font-medium text-red-200">Delete account</p>
              <p className="mt-1 text-sm text-zinc-500">
                Permanently deletes your user, sessions, and any organization where you are the
                only member (workspaces, runs, encrypted keys). Type DELETE to confirm.
              </p>
              <input
                className="mt-3 w-full max-w-xs rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                placeholder="DELETE"
                value={confirmDelete}
                onChange={(e) => setConfirmDelete(e.target.value)}
                autoComplete="off"
              />
              <Button
                type="button"
                variant="danger"
                className="mt-3"
                disabled={busy}
                onClick={() => void deleteAccount()}
              >
                Delete my account
              </Button>
              {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
