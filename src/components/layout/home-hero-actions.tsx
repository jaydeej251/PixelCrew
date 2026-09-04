"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Home hero CTAs must match session — never show "Create free account" while signed in.
 */
export function HomeHeroActions() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((json: { user?: unknown }) => {
        if (!cancelled) setSignedIn(Boolean(json.user));
      })
      .catch(() => {
        if (!cancelled) setSignedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (signedIn === null) {
    return (
      <div className="mt-10 flex h-12 items-center justify-center text-xs text-zinc-600">
        …
      </div>
    );
  }

  if (signedIn) {
    return (
      <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href="/app">
          <Button className="min-w-[160px] px-6 py-3">Open office</Button>
        </Link>
        <Link href="/account">
          <Button variant="secondary" className="min-w-[160px] px-6 py-3">
            Account
          </Button>
        </Link>
      </div>
    );
  }

  return (
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
  );
}
