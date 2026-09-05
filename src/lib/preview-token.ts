import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_TTL_SECONDS = 5 * 60;
/** Shareable preview links copied from the Done HUD. */
export const SHARE_PREVIEW_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEVELOPMENT_SECRET = "pixelcrew-preview-token-development-only";

type PreviewTokenPayload = {
  runId: string;
  expiresAt: number;
};

function tokenSecret(): string {
  const secret =
    process.env.PREVIEW_TOKEN_SECRET?.trim() ||
    process.env.ENCRYPTION_KEY?.trim() ||
    DEVELOPMENT_SECRET;
  if (
    process.env.NODE_ENV === "production" &&
    (secret === DEVELOPMENT_SECRET || secret.length < 32)
  ) {
    throw new Error(
      "PREVIEW_TOKEN_SECRET or ENCRYPTION_KEY must be at least 32 characters in production",
    );
  }
  return secret;
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", tokenSecret()).update(encodedPayload).digest("base64url");
}

export function createPreviewToken(
  runId: string,
  now = Date.now(),
  ttlSeconds = TOKEN_TTL_SECONDS,
): string {
  const payload: PreviewTokenPayload = {
    runId,
    expiresAt: Math.floor(now / 1_000) + ttlSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyPreviewToken(token: string, now = Date.now()): PreviewTokenPayload | null {
  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra) return null;

  const expected = Buffer.from(sign(encodedPayload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<PreviewTokenPayload>;
    if (
      typeof payload.runId !== "string" ||
      !payload.runId ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Math.floor(now / 1_000)
    ) {
      return null;
    }
    return { runId: payload.runId, expiresAt: payload.expiresAt };
  } catch {
    return null;
  }
}
