import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractErrorText, formatLlmHttpError } from "./http-errors";

describe("LLM HTTP error formatting", () => {
  it("extracts nested OpenAI-style error messages", () => {
    assert.equal(
      extractErrorText(JSON.stringify({ error: { message: "Unauthorized" } })),
      "Unauthorized",
    );
  });

  it("explains Ollama Cloud 401 without treating it as OpenRouter", () => {
    const message = formatLlmHttpError({
      provider: "ollama",
      baseUrl: "https://ollama.com/v1",
      model: "minimax-m3",
      status: 401,
      body: '{"error":"unauthorized"}',
    });
    assert.match(message, /Ollama Cloud HTTP 401/);
    assert.match(message, /settings\/keys/);
    assert.doesNotMatch(message, /OpenRouter/);
    assert.doesNotMatch(message, /sk-or-v1/);
  });

  it("points at native /api/chat when that was the request URL", () => {
    const message = formatLlmHttpError({
      provider: "ollama",
      baseUrl: "https://ollama.com/api/chat",
      model: "gpt-oss:120b",
      status: 401,
      body: "Unauthorized",
    });
    assert.match(message, /https:\/\/ollama\.com\/api\/chat/);
    assert.doesNotMatch(message, /chat\/completions/);
  });

  it("keeps OpenRouter credit copy on OpenRouter hosts only", () => {
    const message = formatLlmHttpError({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      status: 402,
      body: '{"error":{"message":"Insufficient credits"}}',
    });
    assert.match(message, /OpenRouter: not enough credits/);
  });
});
