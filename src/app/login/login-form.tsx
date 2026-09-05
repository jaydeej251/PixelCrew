"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthLayout } from "@/components/layout/auth-layout";
import { OAuthSection } from "@/components/auth/oauth-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { SHOW_DEV_TOOLS } from "@/lib/dev-tools";
import type { OAuthProvider } from "@/lib/oauth";

export function LoginForm({
  initialError = "",
  oauthProviders = [],
}: {
  initialError?: string;
  oauthProviders?: OAuthProvider[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Could not sign in. Check your email and password.");
      return;
    }
    router.push(typeof json.redirectTo === "string" ? json.redirectTo : "/app");
    router.refresh();
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue."
      footer={
        <p className="text-center text-sm text-zinc-500">
          No account?{" "}
          <Link href="/signup" className="text-indigo-400 hover:text-indigo-300">
            Create one
          </Link>
        </p>
      }
    >
      {error && (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}
      <OAuthSection providers={oauthProviders} />
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <p className="text-xs text-zinc-500">
          <span className="text-zinc-600">Forgot password?</span>{" "}
          <span title="Password reset is coming soon">Coming soon</span>
        </p>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? (
            <>
              <Spinner className="size-4" />
              Signing in…
            </>
          ) : (
            "Log in"
          )}
        </Button>
      </form>
      {SHOW_DEV_TOOLS && (
        <p className="mt-4 text-center text-[11px] text-zinc-600">
          Dev: ceo@pixelcrew.local / password123
        </p>
      )}
    </AuthLayout>
  );
}
