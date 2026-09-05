"use client";

import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";
import { BrandMark } from "@/components/layout/brand-mark";
import { isOpsSessionUser, useSessionUser } from "@/hooks/use-session-user";

type SiteHeaderProps = {
  /** Narrower content width for legal/support pages. */
  narrow?: boolean;
};

/**
 * Marketing header that reflects session without clearing it.
 * Signed-in users must see Open office / Account — never only Log in CTAs.
 * Platform ops see Admin instead of the office.
 */
export function SiteHeader({ narrow = false }: SiteHeaderProps) {
  const session = useSessionUser();
  const width = narrow ? "max-w-3xl" : "max-w-6xl";
  const ops = session.status === "signedIn" && isOpsSessionUser(session.user);

  return (
    <header className="border-b border-zinc-800/80 px-6 py-4">
      <div className={`mx-auto flex ${width} items-center justify-between`}>
        <BrandMark showBeta priority />
        <div className="flex items-center gap-2">
          {session.status === "loading" ? (
            <span className="text-xs text-zinc-600">…</span>
          ) : session.status === "signedIn" ? (
            <>
              <Link href="/account" className={buttonClassName("ghost")}>
                My account
              </Link>
              <Link href={ops ? "/admin" : "/app"} className={buttonClassName("primary")}>
                {ops ? "Open admin" : "Open office"}
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className={buttonClassName("ghost")}>
                Log in
              </Link>
              <Link href="/signup" className={buttonClassName("primary")}>
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
