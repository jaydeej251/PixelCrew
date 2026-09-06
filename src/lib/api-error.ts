import { NextResponse } from "next/server";
import { AuthError, authErrorStatus } from "@/lib/auth";

/**
 * Always return JSON from product API routes. Never rethrow — unhandled route
 * errors become empty/HTML 500 bodies and clients crash on `res.json()`.
 */
export function apiErrorResponse(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: authErrorStatus(err) });
  }
  console.error(err);
  if (err instanceof Error && isClientSafeErrorMessage(err.message)) {
    return NextResponse.json(
      { error: err.message },
      { status: looksLikeUpstreamProviderFailure(err.message) ? 502 : 400 },
    );
  }
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

function isClientSafeErrorMessage(message: string): boolean {
  if (!message || message.length > 600) return false;
  if (/prisma|ECONNREFUSED|ENOENT|Cannot read propert|Unique constraint|Foreign key/i.test(message)) {
    return false;
  }
  return CLIENT_SAFE_ERROR_MARKERS.some((re) => re.test(message));
}

function looksLikeUpstreamProviderFailure(message: string): boolean {
  return (
    /^OpenRouter:/i.test(message) ||
    /^Ollama/i.test(message) ||
    /not enough credits/i.test(message) ||
    /Unauthorized/i.test(message) ||
    /invalid API key/i.test(message)
  );
}

const CLIENT_SAFE_ERROR_MARKERS: RegExp[] = [
  /no valid api key/i,
  /^OpenRouter:/i,
  /^Ollama/i,
  /API key/i,
  /No combined plan/i,
  /cannot be published/i,
  /no longer matches the CEO goal/i,
  /Run not found/i,
  /No plan to/i,
  /not enough credits/i,
  /invalid API key/i,
  /requires an API key/i,
  /Plan is not in review/i,
  /No direction questions/i,
  /Unknown question or option/i,
];
