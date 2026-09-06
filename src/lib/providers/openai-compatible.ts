import {
  formatLlmHttpError,
  openRouterAffordableRetryMaxTokens,
  parseOpenRouterAffordableMaxTokens,
} from "./http-errors";
import type { LLMProvider, ChatMessage, StreamChunk, ProviderConfig } from "./types";

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(private config: ProviderConfig) {}

  async stream(
    messages: ChatMessage[],
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<StreamChunk> {
    return this.streamOnce(messages, onChunk, this.config.maxTokens ?? 900, false);
  }

  private async streamOnce(
    messages: ChatMessage[],
    onChunk: (chunk: StreamChunk) => void,
    maxTokens: number,
    isRetry: boolean,
  ): Promise<StreamChunk> {
    const baseUrl = this.config.baseUrl ?? "https://api.openai.com/v1";
    const apiKey = this.config.apiKey?.trim() ?? "";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };

    // OpenRouter recommends these for attribution (optional but helps avoid edge-case rejections)
    if (baseUrl.includes("openrouter.ai")) {
      headers["HTTP-Referer"] =
        process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      headers["X-Title"] = process.env.PRODUCT_NAME ?? "PixelCrew";
    }

    // Anthropic OpenAI-compat layer accepts Bearer; version header keeps the contract explicit.
    if (baseUrl.includes("api.anthropic.com")) {
      headers["anthropic-version"] = "2023-06-01";
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: true,
        max_tokens: maxTokens,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      const url = `${baseUrl}/chat/completions`;
      console.warn(
        `[PixelCrew] ${this.config.provider} HTTP ${res.status} ${url} model=${this.config.model} body=${err.slice(0, 300)}`,
      );

      if (!isRetry && baseUrl.includes("openrouter.ai") && res.status === 402) {
        const affordable = parseOpenRouterAffordableMaxTokens(err);
        const retryMax =
          affordable !== null
            ? openRouterAffordableRetryMaxTokens(maxTokens, affordable)
            : null;
        if (retryMax !== null) {
          console.warn(
            `[PixelCrew] OpenRouter affordability retry max_tokens=${maxTokens}→${retryMax}`,
          );
          return this.streamOnce(messages, onChunk, retryMax, true);
        }
      }

      throw new Error(
        formatLlmHttpError({
          provider: this.config.provider,
          baseUrl,
          model: this.config.model,
          status: res.status,
          body: err,
        }),
      );
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let full = "";
    let buffer = "";
    let finishReason: string | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content ?? "";
          if (content) {
            full += content;
            onChunk({ content });
          }
          const reason = parsed.choices?.[0]?.finish_reason;
          if (reason) finishReason = reason;
        } catch {
          // skip malformed chunks
        }
      }
    }

    const inputTokens = Math.ceil(
      messages.reduce((a, m) => a + m.content.length, 0) / 4,
    );
    const outputTokens = Math.ceil(full.length / 4);
    return { content: full, done: true, inputTokens, outputTokens, finishReason };
  }
}

export function createOpenAICompatible(config: ProviderConfig): LLMProvider {
  return new OpenAICompatibleProvider(config);
}
