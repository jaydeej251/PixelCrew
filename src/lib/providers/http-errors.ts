/** Turn an LLM HTTP failure into a user-facing message. Never include the API key. */
export function formatLlmHttpError(opts: {
  provider: string;
  baseUrl: string;
  model: string;
  status: number;
  body: string;
}): string {
  const raw = extractErrorText(opts.body);
  const isOpenRouter = opts.baseUrl.includes("openrouter.ai");
  const isOllamaCloud = /ollama\.com/i.test(opts.baseUrl);
  const unauthorized =
    opts.status === 401 ||
    opts.status === 403 ||
    /unauthorized/i.test(raw);

  if (isOllamaCloud && unauthorized) {
    const target = opts.baseUrl.includes("/api/chat")
      ? opts.baseUrl
      : `${opts.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    return (
      `Ollama Cloud HTTP ${opts.status}: ${raw || "Unauthorized"}. ` +
      `PixelCrew sent model “${opts.model}” to ${target}. ` +
      `Use an API key from ollama.com/settings/keys (copied once when created). ` +
      `“ollama signin” / the desktop app login is not that key.`
    );
  }

  if (isOpenRouter && (raw.includes("more credits") || raw.includes("Insufficient") || raw.includes("can only afford"))) {
    return "OpenRouter: not enough credits. Add funds at openrouter.ai/settings/credits, use a free model, or switch to Ollama locally.";
  }
  if (isOpenRouter && (raw.includes("Authentication") || raw.includes("API key") || unauthorized)) {
    return "OpenRouter: invalid API key. Check sk-or-v1- prefix in .env.local.";
  }

  const isAnthropic = opts.baseUrl.includes("api.anthropic.com");
  if (isAnthropic && unauthorized) {
    return "Anthropic: invalid API key. Paste a full sk-ant-… key from console.anthropic.com, or re-save it under Anthropic in Settings.";
  }

  if (raw) return raw;
  return `${opts.provider} HTTP ${opts.status}`;
}

/**
 * OpenRouter 402 bodies often say “can only afford 4203” when max_tokens is too high
 * for remaining credits. Returns that ceiling, or null if not present.
 */
export function parseOpenRouterAffordableMaxTokens(body: string): number | null {
  const raw = extractErrorText(body);
  const match = raw.match(/can only afford\s+(\d+)/i);
  if (!match) return null;
  const n = Number.parseInt(match[1]!, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** One retry budget under the afford ceiling (OpenRouter reserves against max_tokens). */
export function openRouterAffordableRetryMaxTokens(
  currentMaxTokens: number,
  affordable: number,
): number | null {
  if (affordable <= 0 || currentMaxTokens <= affordable) return null;
  return Math.max(256, affordable - 64);
}

export function extractErrorText(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof parsed.error === "string") return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
    if (parsed.message) return parsed.message;
  } catch {
    // plain text body
  }
  return trimmed.slice(0, 400);
}
