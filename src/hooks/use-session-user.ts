"use client";

import { useEffect, useState } from "react";

export type SessionUser = {
  email: string;
  name: string | null;
  platformRole?: string | null;
};

type SessionState =
  | { status: "loading"; user: null }
  | { status: "signedOut"; user: null }
  | { status: "signedIn"; user: SessionUser };

/**
 * Shared /api/auth/me subscription for marketing chrome.
 * Does not clear cookies — read-only session reflection.
 */
export function useSessionUser(): SessionState {
  const [state, setState] = useState<SessionState>({ status: "loading", user: null });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((json: { user?: SessionUser | null }) => {
        if (cancelled) return;
        if (json.user) setState({ status: "signedIn", user: json.user });
        else setState({ status: "signedOut", user: null });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "signedOut", user: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function isOpsSessionUser(user: SessionUser | null | undefined): boolean {
  return user?.platformRole === "ops" || user?.platformRole === "owner";
}
