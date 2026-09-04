import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSession, SESSION_COOKIE } from "@/lib/auth";
import {
  OAUTH_STATE_COOKIE,
  OAuthError,
  appOrigin,
  fetchOAuthIdentity,
  isOAuthProvider,
  prismaOAuthUserRepository,
  resolveOAuthUser,
  verifyOAuthState,
} from "@/lib/oauth";
import { consumeRateLimit, requestClientIp } from "@/lib/rate-limit";

type RouteContext = { params: Promise<{ provider: string }> };

function loginErrorRedirect(code: string) {
  const url = new URL("/login", appOrigin());
  url.searchParams.set("error", code);
  const response = NextResponse.redirect(url);
  response.cookies.set(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function GET(req: Request, context: RouteContext) {
  const limit = await consumeRateLimit({
    scope: "auth-oauth-callback-ip",
    identifier: requestClientIp(req),
    limit: 30,
    windowMs: 10 * 60_000,
  });
  if (!limit.allowed) return loginErrorRedirect("rate_limited");

  const { provider: raw } = await context.params;

  if (!isOAuthProvider(raw)) {
    return loginErrorRedirect("invalid_provider");
  }

  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  if (error) {
    return loginErrorRedirect(error === "access_denied" ? "access_denied" : "provider_error");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const cookieState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;

  if (!code || !verifyOAuthState(raw, state, cookieState)) {
    return loginErrorRedirect("invalid_state");
  }

  try {
    const identity = await fetchOAuthIdentity(raw, code);
    const { userId } = await resolveOAuthUser(identity, prismaOAuthUserRepository);
    const token = await createSession(userId);
    const response = NextResponse.redirect(new URL("/app", appOrigin()));
    response.cookies.set(OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (err) {
    if (err instanceof OAuthError) {
      return loginErrorRedirect(err.code);
    }
    console.error("oauth callback failed", err);
    return loginErrorRedirect("provider_error");
  }
}
