const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

type RequestSecurityEnvironment = {
  NODE_ENV?: string;
  NEXT_PUBLIC_APP_URL?: string;
};

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

  const requestOrigin = new URL(request.url).origin;
  const allowed = new Set([requestOrigin]);
  const configuredAppUrl = environment.NEXT_PUBLIC_APP_URL;
  if (configuredAppUrl) {
    try {
      const configuredOrigin = new URL(configuredAppUrl).origin;
      if (environment.NODE_ENV === "production" && requestOrigin !== configuredOrigin) {
        return false;
      }
      allowed.add(configuredOrigin);
    } catch {
      return false;
    }
  }
  return allowed.has(normalizedOrigin);
}
