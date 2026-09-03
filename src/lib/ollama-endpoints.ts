export const OLLAMA_LOCAL_BASE_URL = "http://127.0.0.1:11434/v1";
export const OLLAMA_CLOUD_BASE_URL = "https://ollama.com/v1";

export function isOllamaCloudBaseUrl(baseUrl: string | null | undefined): boolean {
  if (!baseUrl) return false;
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === "ollama.com" || host.endsWith(".ollama.com");
  } catch {
    return /ollama\.com/i.test(baseUrl);
  }
}
