import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createProvider, resolveProviderConfig } from "./index";
import {
  isOllamaCloudBaseUrl,
  isOllamaLocalBaseUrl,
  ollamaNativeChatUrl,
  OLLAMA_CLOUD_BASE_URL,
  OLLAMA_LOCAL_BASE_URL,
} from "../ollama-endpoints";

const env = process.env as Record<string, string | undefined>;
const originalBaseUrl = env.OLLAMA_BASE_URL;
const originalApiKey = env.OLLAMA_API_KEY;
const originalNodeEnv = env.NODE_ENV;

afterEach(() => {
  if (originalBaseUrl === undefined) delete env.OLLAMA_BASE_URL;
  else env.OLLAMA_BASE_URL = originalBaseUrl;
  if (originalApiKey === undefined) delete env.OLLAMA_API_KEY;
  else env.OLLAMA_API_KEY = originalApiKey;
  if (originalNodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = originalNodeEnv;
});

describe("ollama endpoint helpers", () => {
  it("detects local and cloud hosts including localhost aliases", () => {
    assert.equal(isOllamaLocalBaseUrl(OLLAMA_LOCAL_BASE_URL), true);
    assert.equal(isOllamaLocalBaseUrl("http://localhost:11434/v1"), true);
    assert.equal(isOllamaLocalBaseUrl(OLLAMA_CLOUD_BASE_URL), false);
    assert.equal(isOllamaCloudBaseUrl(OLLAMA_CLOUD_BASE_URL), true);
    assert.equal(isOllamaCloudBaseUrl("https://ollama.com/v1/"), true);
    assert.equal(isOllamaCloudBaseUrl(OLLAMA_LOCAL_BASE_URL), false);
    assert.equal(ollamaNativeChatUrl(OLLAMA_CLOUD_BASE_URL), "https://ollama.com/api/chat");
    assert.equal(ollamaNativeChatUrl(OLLAMA_LOCAL_BASE_URL), "http://127.0.0.1:11434/api/chat");
  });
});

describe("ollama provider config", () => {
  it("defaults to local Ollama without an API key", () => {
    delete env.OLLAMA_BASE_URL;
    delete env.OLLAMA_API_KEY;
    env.NODE_ENV = "development";

    const config = resolveProviderConfig("ollama", "llama3.2");
    assert.equal(config.baseUrl, OLLAMA_LOCAL_BASE_URL);
    assert.equal(config.apiKey, "ollama");
  });

  it("uses Ollama Cloud when an API key is present and no base URL is set", () => {
    delete env.OLLAMA_BASE_URL;
    env.OLLAMA_API_KEY = "ollama-cloud-test-key-12345";
    env.NODE_ENV = "development";

    const config = resolveProviderConfig("ollama", "gpt-oss:120b");
    assert.equal(config.baseUrl, OLLAMA_CLOUD_BASE_URL);
    assert.equal(config.apiKey, "ollama-cloud-test-key-12345");
  });

  it("prefers cloud over the local .env default when an API key is set", () => {
    env.OLLAMA_BASE_URL = "http://localhost:11434/v1";
    env.OLLAMA_API_KEY = "ollama-cloud-test-key-12345";
    env.NODE_ENV = "development";

    const config = resolveProviderConfig("ollama", "gpt-oss:120b");
    assert.equal(config.baseUrl, OLLAMA_CLOUD_BASE_URL);
  });

  it("keeps an explicit local base URL even when a key is saved", () => {
    delete env.OLLAMA_BASE_URL;
    delete env.OLLAMA_API_KEY;
    env.NODE_ENV = "development";

    const config = resolveProviderConfig("ollama", "llama3.2", {
      baseUrl: OLLAMA_LOCAL_BASE_URL,
    });
    assert.equal(config.baseUrl, OLLAMA_LOCAL_BASE_URL);
  });

  it("honors an explicit cloud base URL from the credential", () => {
    delete env.OLLAMA_BASE_URL;
    delete env.OLLAMA_API_KEY;
    env.NODE_ENV = "development";

    const config = resolveProviderConfig("ollama", "gpt-oss:120b", {
      baseUrl: `${OLLAMA_CLOUD_BASE_URL}/`,
    });
    assert.equal(config.baseUrl, OLLAMA_CLOUD_BASE_URL);
  });

  it("rejects creating a cloud provider without a real API key", () => {
    assert.throws(
      () =>
        createProvider(
          {
            provider: "ollama",
            apiKey: "ollama",
            baseUrl: OLLAMA_CLOUD_BASE_URL,
            model: "gpt-oss:120b",
          },
          "engineer",
          "Build a page",
        ),
      /Ollama Cloud requires an API key/,
    );
  });

  it("uses native /api/chat for Ollama Cloud, not OpenAI /v1/chat/completions", () => {
    const provider = createProvider(
      {
        provider: "ollama",
        apiKey: "ollama-cloud-test-key-12345",
        baseUrl: OLLAMA_CLOUD_BASE_URL,
        model: "gpt-oss:120b",
      },
      "engineer",
      "Build a page",
    );
    assert.equal(provider.constructor.name, "OllamaNativeChatProvider");
  });
});
