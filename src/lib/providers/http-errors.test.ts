import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractErrorText,
  formatLlmHttpError,
  openRouterAffordableRetryMaxTokens,
  parseOpenRouterAffordableMaxTokens,
} from "./http-errors";

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

  it("maps OpenRouter can-only-afford bodies to the credits message", () => {
    const message = formatLlmHttpError({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      status: 402,
      body: JSON.stringify({
        error: {
          message:
            "This request requires more credits, or fewer max_tokens. You requested up to 6000 tokens, but can only afford 4203.",
        },
      }),
    });
    assert.match(message, /OpenRouter: not enough credits/);
  });

  it("explains Anthropic 401 on Anthropic hosts", () => {
    const message = formatLlmHttpError({
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      model: "claude-3-5-haiku-latest",
      status: 401,
      body: '{"error":{"message":"invalid x-api-key"}}',
    });
    assert.match(message, /Anthropic: invalid API key/);
    assert.match(message, /sk-ant/);
    assert.doesNotMatch(message, /OpenRouter/);
  });
});

describe("parseOpenRouterAffordableMaxTokens", () => {
  it("reads the afford ceiling from OpenRouter 402 bodies", () => {
    const body = JSON.stringify({
      error: {
        message:
          "This request requires more credits, or fewer max_tokens. You requested up to 6000 tokens, but can only afford 4203. To increase, visit https://openrouter.ai/settings/credits",
        code: 402,
      },
    });
    assert.equal(parseOpenRouterAffordableMaxTokens(body), 4203);
  });

  it("returns null when the body has no afford ceiling", () => {
    assert.equal(parseOpenRouterAffordableMaxTokens('{"error":"Insufficient credits"}'), null);
    assert.equal(parseOpenRouterAffordableMaxTokens(""), null);
  });
});

describe("openRouterAffordableRetryMaxTokens", () => {
  it("retries under the afford ceiling when current max is too high", () => {
    assert.equal(openRouterAffordableRetryMaxTokens(6000, 4203), 4139);
  });

  it("does not retry when already within the ceiling", () => {
    assert.equal(openRouterAffordableRetryMaxTokens(2000, 4203), null);
  });

  it("floors the retry at 256", () => {
    assert.equal(openRouterAffordableRetryMaxTokens(900, 100), 256);
  });
});
