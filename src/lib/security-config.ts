import { resolvePreviewOrigins } from "./preview-origin";

type SecurityEnvironment = {
  NODE_ENV?: string;
  NEXT_PUBLIC_APP_URL?: string;
  PREVIEW_ORIGIN?: string;
  ENCRYPTION_KEY?: string;
  PREVIEW_TOKEN_SECRET?: string;
  SANDBOX_ENABLED?: string;
  SANDBOX_PROVIDER?: string;
  ALLOW_LOCAL_SANDBOX_IN_PRODUCTION?: string;
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

  // Only treat local sandbox as "requested" when it is actually enabled.
  // SANDBOX_PROVIDER=local with SANDBOX_ENABLED=false is a safe default for .env.example.
  const provider = environment.SANDBOX_PROVIDER?.trim() || "local";
  const localSandboxRequested =
    environment.SANDBOX_ENABLED === "true" && provider === "local";
  if (
    localSandboxRequested &&
    environment.ALLOW_LOCAL_SANDBOX_IN_PRODUCTION !== "true"
  ) {
    throw new Error(
      "Production sandbox execution requires ALLOW_LOCAL_SANDBOX_IN_PRODUCTION=true",
    );
  }

  resolvePreviewOrigins(environment.NEXT_PUBLIC_APP_URL ?? "http://invalid", environment);
}
