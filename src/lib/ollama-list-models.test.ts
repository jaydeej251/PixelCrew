import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OLLAMA_CLOUD_BASE_URL,
  OLLAMA_LOCAL_BASE_URL,
} from "./ollama-endpoints";
import {
  canListOllamaModelsFromBaseUrl,
  fetchOllamaInstalledModels,
  ollamaOpenAiModelsUrl,
  ollamaTagsUrl,
  parseOllamaTagsPayload,
  parseOpenAiModelsPayload,
} from "./ollama-list-models";

describe("ollama local model listing", () => {
  it("only allows loopback Ollama endpoints", () => {
    assert.equal(canListOllamaModelsFromBaseUrl(OLLAMA_LOCAL_BASE_URL), true);
    assert.equal(canListOllamaModelsFromBaseUrl("http://localhost:11434/v1"), true);
    assert.equal(canListOllamaModelsFromBaseUrl(OLLAMA_CLOUD_BASE_URL), false);
    assert.equal(canListOllamaModelsFromBaseUrl("https://evil.example/v1"), false);
    assert.equal(canListOllamaModelsFromBaseUrl("http://192.168.1.10:11434/v1"), false);
    assert.equal(canListOllamaModelsFromBaseUrl(null), false);
  });

  it("builds tags and OpenAI models URLs from the /v1 base", () => {
    assert.equal(ollamaTagsUrl(OLLAMA_LOCAL_BASE_URL), "http://127.0.0.1:11434/api/tags");
    assert.equal(
      ollamaOpenAiModelsUrl(OLLAMA_LOCAL_BASE_URL),
      "http://127.0.0.1:11434/v1/models",
    );
    assert.equal(
      ollamaTagsUrl("http://localhost:11434/v1/"),
      "http://localhost:11434/api/tags",
    );
  });

  it("parses /api/tags payloads and dedupes case-insensitively", () => {
    assert.deepEqual(
      parseOllamaTagsPayload({
        models: [
          { name: "qwen2.5-coder:14b" },
          { name: "Llama3.2" },
          { name: "llama3.2" },
          { model: "mistral:latest" },
          null,
          { name: 12 },
        ],
      }),
      ["Llama3.2", "mistral:latest", "qwen2.5-coder:14b"],
    );
    assert.deepEqual(parseOllamaTagsPayload({ models: [] }), []);
    assert.deepEqual(parseOllamaTagsPayload(null), []);
  });

  it("parses OpenAI /v1/models payloads", () => {
    assert.deepEqual(
      parseOpenAiModelsPayload({
        data: [{ id: "codellama" }, { id: "alpha" }, { id: "codellama" }, {}],
      }),
      ["alpha", "codellama"],
    );
  });

  it("prefers /api/tags and falls back to /v1/models", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/api/tags")) {
        return new Response(JSON.stringify({ models: [{ name: "from-tags" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`unexpected ${url}`);
    };

    const result = await fetchOllamaInstalledModels({
      baseUrl: OLLAMA_LOCAL_BASE_URL,
      fetchImpl,
    });
    assert.deepEqual(result, { models: ["from-tags"], source: "tags" });
    assert.deepEqual(calls, ["http://127.0.0.1:11434/api/tags"]);
  });

  it("falls back when tags fails", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/tags")) {
        return new Response("nope", { status: 500 });
      }
      return new Response(JSON.stringify({ data: [{ id: "from-openai" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await fetchOllamaInstalledModels({
      baseUrl: OLLAMA_LOCAL_BASE_URL,
      fetchImpl,
    });
    assert.deepEqual(result, { models: ["from-openai"], source: "openai_models" });
  });

  it("rejects cloud and unreachable targets with clear errors", async () => {
    await assert.rejects(
      () => fetchOllamaInstalledModels({ baseUrl: OLLAMA_CLOUD_BASE_URL }),
      /Use local/i,
    );

    const fetchImpl: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    await assert.rejects(
      () =>
        fetchOllamaInstalledModels({
          baseUrl: OLLAMA_LOCAL_BASE_URL,
          fetchImpl,
        }),
      /can’t find the Ollama app|Open Ollama|Use cloud/i,
    );
  });
});
