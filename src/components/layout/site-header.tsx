"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";

type MeUser = { email: string; name: string | null };

type SiteHeaderProps = {
  /** Narrower content width for legal/support pages. */
  narrow?: boolean;
};

/**
 * Marketing header that reflects session without clearing it.
 * Signed-in users must see Open office / Account — never only Log in CTAs.
 */
export function SiteHeader({ narrow = false }: SiteHeaderProps) {
  const [user, setUser] = useState<MeUser | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((json: { user?: MeUser | null }) => {
        if (cancelled) return;
        setUser(json.user ?? null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const width = narrow ? "max-w-3xl" : "max-w-5xl";

  return (
    <header className="border-b border-zinc-800/80 px-6 py-4">
      <div className={`mx-auto flex ${width} items-center justify-between`}>
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-500/20 text-sm text-indigo-300">
            P
          </span>
          {PRODUCT_NAME}
          <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-200">
            Beta
          </span>
        </Link>
        <div className="flex items-center gap-2">
          {user === undefined ? (
            <span className="text-xs text-zinc-600">…</span>
          ) : user ? (
            <>
              <Link href="/account">
                <Button variant="ghost" type="button">
                  Account
                </Button>
              </Link>
              <Link href="/app">
                <Button type="button">Open office</Button>
              </Link>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" type="button">
                  Log in
                </Button>
              </Link>
              <Link href="/signup">
                <Button type="button">Get started</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
