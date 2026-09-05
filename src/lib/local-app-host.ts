/**
 * PixelCrew can only reach a user's local Ollama when the Next.js process
 * runs on the same machine (browser on localhost / 127.0.0.1).
 * The live hosted site cannot see the visitor's Ollama app.
 */

export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/** True when the user is browsing PixelCrew on this computer (dev / local install). */
export function isBrowserLocalPixelCrewHost(): boolean {
  if (typeof window === "undefined") return false;
  return isLoopbackHostname(window.location.hostname);
}

/** True when the public Host of this API request is loopback (not the live domain). */
export function isLocalPixelCrewRequest(request: Request): boolean {
  try {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    if (forwardedHost) {
      return isLoopbackHostname(forwardedHost.split(":")[0] ?? forwardedHost);
    }
    return isLoopbackHostname(new URL(request.url).hostname);
  } catch {
    return false;
  }
}
