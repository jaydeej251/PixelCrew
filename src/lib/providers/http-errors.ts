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

  if (isOpenRouter && (raw.includes("more credits") || raw.includes("Insufficient"))) {
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
