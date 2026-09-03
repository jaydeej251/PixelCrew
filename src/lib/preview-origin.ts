type PreviewEnvironment = {
  NODE_ENV?: string;
  NEXT_PUBLIC_APP_URL?: string;
  PREVIEW_ORIGIN?: string;
};

function parseOrigin(value: string, name: string): string {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    return url.origin;
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) origin`);
  }
}

export function resolvePreviewOrigins(
  requestUrl: string,
  environment: PreviewEnvironment = process.env,
): { appOrigin: string; previewOrigin: string } {
  const requestOrigin = new URL(requestUrl).origin;
  const appOrigin = environment.NEXT_PUBLIC_APP_URL
    ? parseOrigin(environment.NEXT_PUBLIC_APP_URL, "NEXT_PUBLIC_APP_URL")
    : requestOrigin;
  const previewOrigin = environment.PREVIEW_ORIGIN
    ? parseOrigin(environment.PREVIEW_ORIGIN, "PREVIEW_ORIGIN")
    : requestOrigin;

  if (environment.NODE_ENV === "production") {
    if (!environment.NEXT_PUBLIC_APP_URL || !environment.PREVIEW_ORIGIN) {
      throw new Error(
        "NEXT_PUBLIC_APP_URL and PREVIEW_ORIGIN are required for production preview isolation",
      );
    }
    if (appOrigin === previewOrigin) {
      throw new Error("PREVIEW_ORIGIN must differ from NEXT_PUBLIC_APP_URL in production");
    }
    if (!appOrigin.startsWith("https://") || !previewOrigin.startsWith("https://")) {
      throw new Error("Production app and preview origins must use HTTPS");
    }
  }

  return { appOrigin, previewOrigin };
}
