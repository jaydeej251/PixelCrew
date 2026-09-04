"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
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
        <Link href={ops ? "/admin" : "/app"}>
          <Button className="min-w-[160px] px-6 py-3">
            {ops ? "Open admin" : "Open office"}
          </Button>
        </Link>
        <Link href="/pricing">
          <Button variant="secondary" className="min-w-[160px] px-6 py-3">
            View pricing
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
      <Link href="/signup">
        <Button className="min-w-[160px] px-6 py-3">Create free account</Button>
      </Link>
      <Link href="/login">
        <Button variant="secondary" className="min-w-[160px] px-6 py-3">
          Log in
        </Button>
      </Link>
    </div>
  );
}
