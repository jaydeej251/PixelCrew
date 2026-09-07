export const OLLAMA_LOCAL_BASE_URL = "http://127.0.0.1:11434/v1";
export const OLLAMA_CLOUD_BASE_URL = "https://ollama.com/v1";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

function parseUrl(baseUrl: string): URL | null {
  try {
    return new URL(baseUrl);
  } catch {
    return null;
  }
}

/** Strip trailing slashes so localhost and credential URLs compare cleanly. */
export function normalizeOllamaBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

export function isOllamaCloudBaseUrl(baseUrl: string | null | undefined): boolean {
  if (!baseUrl) return false;
  const parsed = parseUrl(baseUrl);
  if (!parsed) return /ollama\.com/i.test(baseUrl);
  const host = parsed.hostname.toLowerCase();
  return host === "ollama.com" || host.endsWith(".ollama.com");
}

export function isOllamaLocalBaseUrl(baseUrl: string | null | undefined): boolean {
  if (!baseUrl) return false;
  const parsed = parseUrl(baseUrl);
  if (!parsed) return false;
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  return LOCAL_HOSTS.has(parsed.hostname.toLowerCase()) && port === "11434";
}

/**
 * Same resolution the LLM layer uses for Ollama base URL (credential → env → key heuristic).
 * Kept here so run-setup can detect local vs cloud without importing providers.
 */
export function resolveOllamaBaseUrl(
  credentialBaseUrl: string | null | undefined,
  hasApiKey: boolean,
): string {
  const fromCredential = credentialBaseUrl?.trim();
  if (fromCredential) return normalizeOllamaBaseUrl(fromCredential);

  const fromEnv =
    typeof process !== "undefined" ? process.env.OLLAMA_BASE_URL?.trim() : undefined;
  if (fromEnv) {
    const cleaned = normalizeOllamaBaseUrl(fromEnv);
    // .env.example defaults to local; a cloud API key should win over that default.
    if (hasApiKey && isOllamaLocalBaseUrl(cleaned)) {
      return OLLAMA_CLOUD_BASE_URL;
    }
    return cleaned;
  }

  return hasApiKey ? OLLAMA_CLOUD_BASE_URL : OLLAMA_LOCAL_BASE_URL;
}

/**
 * Direct ollama.com chat lives at `/api/chat`, not OpenAI `/v1/chat/completions`.
 * Settings still store the OpenAI-style `/v1` URL for local + display.
 */
export function ollamaNativeChatUrl(openaiCompatBaseUrl: string): string {
  const cleaned = normalizeOllamaBaseUrl(openaiCompatBaseUrl);
  const parsed = parseUrl(cleaned);
  const origin = parsed?.origin ?? "https://ollama.com";
  return `${origin}/api/chat`;
}
