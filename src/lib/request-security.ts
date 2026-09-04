const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

type RequestSecurityEnvironment = {
  NODE_ENV?: string;
  NEXT_PUBLIC_APP_URL?: string;
};

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

/**
 * Public origin as seen by the client. Behind Caddy/nginx, `request.url` is often
 * http://127.0.0.1:3000 — prefer X-Forwarded-* when present.
 */
export function resolvePublicRequestOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedHost) {
    const proto = forwardedProto || "https";
    try {
      return new URL(`${proto}://${forwardedHost}`).origin;
    } catch {
      // fall through to request.url
    }
  }
  return new URL(request.url).origin;
}

export function isTrustedMutationRequest(
  request: Request,
  environment: RequestSecurityEnvironment = process.env,
): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) {
    // Non-browser clients do not send Origin or Sec-Fetch-Site. Browsers send at least one for
    // cross-site mutations, so allowing this preserves CLI/provider integrations.
    return fetchSite === null || fetchSite === "same-origin" || fetchSite === "none";
  }

  let normalizedOrigin: string;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    return false;
  }

  const requestOrigin = resolvePublicRequestOrigin(request);
  const allowed = new Set([requestOrigin]);
  const configuredAppUrl = environment.NEXT_PUBLIC_APP_URL;
  let configuredOrigin: string | undefined;
  if (configuredAppUrl) {
    try {
      configuredOrigin = new URL(configuredAppUrl).origin;
      allowed.add(configuredOrigin);
    } catch {
      return false;
    }
  }

  if (environment.NODE_ENV === "production") {
    if (!configuredOrigin) return false;

    // Direct public host (or correctly forwarded): must match configured app URL.
    if (requestOrigin === configuredOrigin) {
      return allowed.has(normalizedOrigin);
    }

    // Local reverse proxy without usable Host rewrite: request.url is loopback, browser
    // Origin still carries the public site — require Origin === NEXT_PUBLIC_APP_URL.
    try {
      if (isLoopbackHostname(new URL(request.url).hostname)) {
        return normalizedOrigin === configuredOrigin;
      }
    } catch {
      return false;
    }

    // Forged or wrong public Host.
    return false;
  }

  return allowed.has(normalizedOrigin);
}
