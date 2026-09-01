import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/pricing",
  "/onboarding",
  "/api/auth",
  "/api/waitlist",
  "/api/stripe",
  "/api/inngest",
];

function isPublic(pathname: string): boolean {
  if (pathname === "/" || pathname.startsWith("/_next")) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const session = request.cookies.get("pc_session");
  const needsAuth =
    pathname.startsWith("/app") ||
    pathname.startsWith("/api/runs") ||
    pathname.startsWith("/api/workspace") ||
    pathname.startsWith("/api/credentials") ||
    pathname.startsWith("/api/agents") ||
    pathname.startsWith("/api/providers") ||
    pathname.startsWith("/api/simulate");

  if (needsAuth && !session?.value) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const login = new URL("/login", request.url);
    login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
