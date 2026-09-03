import { resolvePreviewOrigins } from "./preview-origin";

type SecurityEnvironment = {
  NODE_ENV?: string;
  NEXT_PUBLIC_APP_URL?: string;
  PREVIEW_ORIGIN?: string;
  ENCRYPTION_KEY?: string;
  PREVIEW_TOKEN_SECRET?: string;
};

const INSECURE_ENCRYPTION_KEYS = new Set([
  "dev-only-key-do-not-use-in-production!!",
  "change-me-to-a-64-char-hex-string",
]);

export function validateProductionSecurityConfig(
  environment: SecurityEnvironment = process.env,
): void {
  if (environment.NODE_ENV !== "production") return;

  const encryptionKey = environment.ENCRYPTION_KEY?.trim() ?? "";
  if (encryptionKey.length < 32 || INSECURE_ENCRYPTION_KEYS.has(encryptionKey)) {
    throw new Error("A unique ENCRYPTION_KEY of at least 32 characters is required in production");
  }

  const previewTokenSecret =
    environment.PREVIEW_TOKEN_SECRET?.trim() || encryptionKey;
  if (previewTokenSecret.length < 32) {
    throw new Error(
      "PREVIEW_TOKEN_SECRET or ENCRYPTION_KEY must be at least 32 characters in production",
    );
  }

  resolvePreviewOrigins(environment.NEXT_PUBLIC_APP_URL ?? "http://invalid", environment);
}
