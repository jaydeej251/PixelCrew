import type { ProviderType } from "@prisma/client";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ProviderConfig = {
  provider: ProviderType;
  apiKey?: string;
  baseUrl?: string;
  model: string;
};

export type StreamChunk = {
  content: string;
  done?: boolean;
  inputTokens?: number;
  outputTokens?: number;
};

export interface LLMProvider {
  stream(messages: ChatMessage[], onChunk: (chunk: StreamChunk) => void): Promise<StreamChunk>;
}

export function estimateCost(
  provider: ProviderType,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates: Record<string, { in: number; out: number }> = {
    "gpt-4o": { in: 2.5 / 1_000_000, out: 10 / 1_000_000 },
    "gpt-4o-mini": { in: 0.15 / 1_000_000, out: 0.6 / 1_000_000 },
    "claude-3-5-sonnet": { in: 3 / 1_000_000, out: 15 / 1_000_000 },
    mock: { in: 0, out: 0 },
  };
  const rate = rates[model] ?? { in: 1 / 1_000_000, out: 3 / 1_000_000 };
  return inputTokens * rate.in + outputTokens * rate.out;
}
