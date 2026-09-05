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
import type { OAuthProvider } from "@/lib/oauth";

export function SignupForm({
  initialError = "",
  oauthProviders = [],
}: {
  initialError?: string;
  oauthProviders?: OAuthProvider[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Could not create your account.");
      return;
    }
    router.push(typeof json.redirectTo === "string" ? json.redirectTo : "/app");
    router.refresh();
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Tell the team what to build. They write the files."
      footer={
        <div className="space-y-2 text-center text-sm text-zinc-500">
          <p>
            Already have an account?{" "}
            <Link href="/login" className="text-indigo-400 hover:text-indigo-300">
              Log in
            </Link>
          </p>
          <p className="text-xs text-zinc-600">
            By signing up you agree to the{" "}
            <Link href="/terms" className="text-zinc-400 hover:text-zinc-200">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-zinc-400 hover:text-zinc-200">
              Privacy
            </Link>{" "}
            notices (beta).
          </p>
        </div>
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
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            type="text"
            autoComplete="name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
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
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-zinc-500">At least 8 characters</p>
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? (
            <>
              <Spinner className="size-4" />
              Creating account…
            </>
          ) : (
            "Sign up"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
