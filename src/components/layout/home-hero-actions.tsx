"use client";

import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";
import { isOpsSessionUser, useSessionUser } from "@/hooks/use-session-user";

/**
 * Home hero CTAs must match session — never show "Create free account" while signed in.
 */
export function HomeHeroActions() {
  const session = useSessionUser();

  if (session.status === "loading") {
    return (
      <div className="mt-8 flex h-12 items-center justify-center text-xs text-zinc-600 sm:justify-start">
        …
      </div>
    );
  }

  if (session.status === "signedIn") {
    const ops = isOpsSessionUser(session.user);
    return (
      <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <Link
          href={ops ? "/admin" : "/app"}
          className={buttonClassName("primary", "min-w-[160px] px-6 py-3")}
        >
          {ops ? "Open admin" : "Open office"}
        </Link>
        <Link href="/pricing" className={buttonClassName("secondary", "min-w-[160px] px-6 py-3")}>
          View pricing
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
      <Link href="/signup" className={buttonClassName("primary", "min-w-[160px] px-6 py-3")}>
        Create free account
      </Link>
      <Link href="/login" className={buttonClassName("secondary", "min-w-[160px] px-6 py-3")}>
        Log in
      </Link>
    </div>
  );
}
