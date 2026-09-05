import {
  isOllamaCloudBaseUrl,
  isOllamaLocalBaseUrl,
  normalizeOllamaBaseUrl,
} from "./ollama-endpoints";

const DEFAULT_TIMEOUT_MS = 4_000;

export type OllamaModelListSource = "tags" | "openai_models";

export type OllamaModelListResult = {
  models: string[];
  source: OllamaModelListSource;
};

/**
 * Only probe loopback Ollama from the app server.
 * Arbitrary credential URLs would open SSRF; cloud listing is a separate flow.
 */
export function canListOllamaModelsFromBaseUrl(
  baseUrl: string | null | undefined,
): boolean {
  if (!baseUrl?.trim()) return false;
  if (isOllamaCloudBaseUrl(baseUrl)) return false;
  return isOllamaLocalBaseUrl(baseUrl);
}

/** OpenAI-compat `/v1` → native `/api/tags` on the same origin. */
export function ollamaTagsUrl(openaiCompatBaseUrl: string): string {
  const cleaned = normalizeOllamaBaseUrl(openaiCompatBaseUrl);
  let origin = "http://127.0.0.1:11434";
  try {
    origin = new URL(cleaned).origin;
  } catch {
    // keep default
  }
  return `${origin}/api/tags`;
}

export function ollamaOpenAiModelsUrl(openaiCompatBaseUrl: string): string {
  return `${normalizeOllamaBaseUrl(openaiCompatBaseUrl)}/models`;
}

function uniqueSortedNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** Parse Ollama native `GET /api/tags` JSON. */
export function parseOllamaTagsPayload(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const models = (payload as { models?: unknown }).models;
  if (!Array.isArray(models)) return [];

  const names: string[] = [];
  for (const entry of models) {
    if (!entry || typeof entry !== "object") continue;
    const name = (entry as { name?: unknown; model?: unknown }).name;
    const model = (entry as { model?: unknown }).model;
    if (typeof name === "string") names.push(name);
    else if (typeof model === "string") names.push(model);
  }
  return uniqueSortedNames(names);
}

/** Parse OpenAI-compat `GET /v1/models` JSON. */
export function parseOpenAiModelsPayload(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];

  const names: string[] = [];
  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue;
    const id = (entry as { id?: unknown }).id;
    if (typeof id === "string") names.push(id);
  }
  return uniqueSortedNames(names);
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Ollama returned non-JSON (HTTP ${res.status})`);
  }
}

function unreachableMessage(err: unknown): string {
  if (err instanceof Error && err.name === "TimeoutError") {
    return "Ollama isn’t responding. Open the Ollama app on this computer, wait a few seconds, then click Refresh.";
  }
  if (err instanceof TypeError) {
    return "We can’t find the Ollama app on this computer. Open Ollama (or install it from ollama.com), then click Refresh. Or switch to Use cloud under Your API keys — that’s the simpler path for most people.";
  }
  if (err instanceof Error && err.message) return err.message;
  return "We couldn’t load your local models right now. Try Refresh, or switch to Use cloud under Your API keys.";
}

/**
 * List installed models from a local Ollama daemon.
 * Prefers `/api/tags`; falls back to OpenAI `/v1/models`.
 */
export async function fetchOllamaInstalledModels(options: {
  baseUrl: string;
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<OllamaModelListResult> {
  if (!canListOllamaModelsFromBaseUrl(options.baseUrl)) {
    throw new Error(
      "Local models only show up when PixelCrew is set to Use local under Your API keys.",
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers: Record<string, string> = { Accept: "application/json" };
  const key = options.apiKey?.trim();
  if (key && key !== "ollama") {
    headers.Authorization = `Bearer ${key}`;
  }

  let lastError: unknown;

  try {
    const tagsRes = await fetchImpl(ollamaTagsUrl(options.baseUrl), {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (tagsRes.ok) {
      return {
        models: parseOllamaTagsPayload(await readJson(tagsRes)),
        source: "tags",
      };
    }
    lastError = new Error(`Ollama /api/tags returned HTTP ${tagsRes.status}`);
  } catch (err) {
    lastError = err;
  }

  try {
    const modelsRes = await fetchImpl(ollamaOpenAiModelsUrl(options.baseUrl), {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!modelsRes.ok) {
      throw new Error(
        "Ollama answered, but listing models failed. Open the Ollama app, then click Refresh — or switch to Use cloud under Your API keys.",
      );
    }
    return {
      models: parseOpenAiModelsPayload(await readJson(modelsRes)),
      source: "openai_models",
    };
  } catch (err) {
    throw new Error(
      unreachableMessage(err instanceof Error ? err : (lastError ?? err)),
    );
  }
}
