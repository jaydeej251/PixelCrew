import { NextResponse } from "next/server";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_SEC,
  OAuthError,
  appOrigin,
  createOAuthState,
  getAuthorizeUrl,
  isOAuthProvider,
  isProviderConfigured,
} from "@/lib/oauth";
import { consumeRateLimit, requestClientIp } from "@/lib/rate-limit";

type RouteContext = { params: Promise<{ provider: string }> };

function loginErrorRedirect(code: string) {
  const url = new URL("/login", appOrigin());
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
}

function oauthStateCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function GET(req: Request, context: RouteContext) {
  const limit = await consumeRateLimit({
    scope: "auth-oauth-start-ip",
    identifier: requestClientIp(req),
    limit: 30,
    windowMs: 10 * 60_000,
  });
  if (!limit.allowed) return loginErrorRedirect("rate_limited");

  const { provider: raw } = await context.params;
  if (!isOAuthProvider(raw)) {
    return loginErrorRedirect("invalid_provider");
  }
  if (!isProviderConfigured(raw)) {
    return loginErrorRedirect("not_configured");
  }

  try {
    const state = createOAuthState(raw);
    const response = NextResponse.redirect(getAuthorizeUrl(raw, state));
    response.cookies.set(OAUTH_STATE_COOKIE, state, oauthStateCookieOptions(OAUTH_STATE_MAX_AGE_SEC));
    return response;
  } catch (err) {
    if (err instanceof OAuthError) {
      return loginErrorRedirect(err.code);
    }
    console.error("oauth start failed", err);
    return loginErrorRedirect("provider_error");
  }
}
