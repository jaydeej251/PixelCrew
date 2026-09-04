import { ollamaNativeChatUrl } from "../ollama-endpoints";
import { formatLlmHttpError } from "./http-errors";
import type { ChatMessage, LLMProvider, ProviderConfig, StreamChunk } from "./types";

type NativeChunk = {
  message?: { content?: string };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
};

/**
 * Ollama Cloud’s documented chat API (`/api/chat`), not OpenAI `/v1/chat/completions`.
 * Listing `/v1/models` can succeed while `/v1/chat/completions` returns 401.
 */
export class OllamaNativeChatProvider implements LLMProvider {
  constructor(private config: ProviderConfig) {}

  async stream(
    messages: ChatMessage[],
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<StreamChunk> {
    const chatUrl = ollamaNativeChatUrl(this.config.baseUrl ?? "https://ollama.com/v1");
    const apiKey = this.config.apiKey?.trim() ?? "";

    const res = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: true,
        options: {
          num_predict: this.config.maxTokens ?? 900,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn(
        `[PixelCrew] ollama HTTP ${res.status} ${chatUrl} model=${this.config.model} body=${err.slice(0, 300)}`,
      );
      throw new Error(
        formatLlmHttpError({
          provider: "ollama",
          baseUrl: chatUrl,
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
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const parsed = parseNativeLine(rawLine);
        if (!parsed) continue;
        const piece = parsed.message?.content ?? "";
        if (piece) {
          full += piece;
          onChunk({ content: piece });
        }
        if (typeof parsed.prompt_eval_count === "number") {
          inputTokens = parsed.prompt_eval_count;
        }
        if (typeof parsed.eval_count === "number") {
          outputTokens = parsed.eval_count;
        }
      }
    }

    const trailing = parseNativeLine(buffer);
    if (trailing?.message?.content) {
      full += trailing.message.content;
      onChunk({ content: trailing.message.content });
    }

    return {
      content: full,
      done: true,
      inputTokens:
        inputTokens ??
        Math.ceil(messages.reduce((a, m) => a + m.content.length, 0) / 4),
      outputTokens: outputTokens ?? Math.ceil(full.length / 4),
    };
  }
}

function parseNativeLine(line: string): NativeChunk | null {
  let data = line.trim();
  if (!data) return null;
  if (data.startsWith("data: ")) data = data.slice(6).trim();
  if (data === "[DONE]") return null;
  try {
    return JSON.parse(data) as NativeChunk;
  } catch {
    return null;
  }
}