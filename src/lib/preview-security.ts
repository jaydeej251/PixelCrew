function previewCsp(previewBaseUrl: string, appOrigin: string): string {
  return [
    "default-src 'none'",
    `base-uri ${previewBaseUrl}`,
    `script-src ${previewBaseUrl} 'unsafe-inline'`,
    `style-src ${previewBaseUrl} 'unsafe-inline'`,
    `img-src ${previewBaseUrl} data: blob:`,
    `font-src ${previewBaseUrl} data:`,
    `media-src ${previewBaseUrl} data: blob:`,
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    `frame-ancestors ${appOrigin}`,
    "sandbox allow-scripts allow-forms",
  ].join("; ");
}

export function previewSecurityHeaders(
  contentType: string,
  previewBaseUrl?: string,
  appOrigin?: string,
): Record<string, string> {
  const headers = {
    "Content-Type": contentType,
    "Cache-Control": "private, no-store, max-age=0",
    "Cross-Origin-Opener-Policy": "same-origin",
    // The iframe has an opaque origin; signed asset URLs are the authorization boundary.
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
  return contentType.startsWith("text/html") && previewBaseUrl && appOrigin
    ? { ...headers, "Content-Security-Policy": previewCsp(previewBaseUrl, appOrigin) }
    : headers;
}
