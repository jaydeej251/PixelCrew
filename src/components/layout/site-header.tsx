"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
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
              <Link href="/account">
                <Button variant="ghost" type="button">
                  My account
                </Button>
              </Link>
              <Link href={ops ? "/admin" : "/app"}>
                <Button type="button">{ops ? "Open admin" : "Open office"}</Button>
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
