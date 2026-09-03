import { createHash } from "crypto";
import { prisma } from "./db";

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

function bucketKey(scope: string, identifier: string): string {
  const digest = createHash("sha256").update(identifier).digest("hex");
  return `${scope}:${digest}`;
}

export function requestClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function consumeRateLimit(options: {
  scope: string;
  identifier: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  const key = bucketKey(options.scope, options.identifier);
  const now = new Date();
  const resetAt = new Date(now.getTime() + options.windowMs);
  const rows = await prisma.$queryRaw<Array<{ count: number; resetAt: Date }>>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
    VALUES (${key}, 1, ${resetAt}, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."resetAt" <= ${now} THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "resetAt" = CASE
        WHEN "RateLimitBucket"."resetAt" <= ${now} THEN ${resetAt}
        ELSE "RateLimitBucket"."resetAt"
      END,
      "updatedAt" = ${now}
    RETURNING "count", "resetAt"
  `;
  const bucket = rows[0];
  if (!bucket) throw new Error("Rate limit bucket update failed");
  if (key.endsWith("00")) {
    await prisma.rateLimitBucket.deleteMany({
      where: { resetAt: { lt: new Date(now.getTime() - 24 * 60 * 60_000) } },
    });
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((bucket.resetAt.getTime() - now.getTime()) / 1_000),
  );
  if (bucket.count > options.limit) {
    console.warn(
      JSON.stringify({
        event: "rate_limit_exceeded",
        scope: options.scope,
        subjectHash: key.slice(key.indexOf(":") + 1),
        resetAt: bucket.resetAt.toISOString(),
      }),
    );
  }
  return {
    allowed: bucket.count <= options.limit,
    limit: options.limit,
    remaining: Math.max(0, options.limit - bucket.count),
    retryAfterSeconds,
  };
}

export function rateLimitResponse(result: RateLimitResult): Response {
  return Response.json(
    { error: "Too many requests. Try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
      },
    },
  );
}
