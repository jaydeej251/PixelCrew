import type { LLMProvider, ChatMessage, StreamChunk, ProviderConfig } from "./types";

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(private config: ProviderConfig) {}

  async stream(
    messages: ChatMessage[],
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<StreamChunk> {
    const baseUrl = this.config.baseUrl ?? "https://api.openai.com/v1";
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey ?? ""}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: true,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`LLM request failed: ${err}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let full = "";
    let buffer = "";

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
        } catch {
          // skip malformed chunks
        }
      }
    }

    const inputTokens = Math.ceil(
      messages.reduce((a, m) => a + m.content.length, 0) / 4,
    );
    const outputTokens = Math.ceil(full.length / 4);
    return { content: full, done: true, inputTokens, outputTokens };
  }
}

export function createOpenAICompatible(config: ProviderConfig): LLMProvider {
  return new OpenAICompatibleProvider(config);
}
