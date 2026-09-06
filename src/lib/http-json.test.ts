import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readResponseJson } from "@/lib/http-json";

describe("readResponseJson", () => {
  it("parses valid JSON bodies", async () => {
    const res = new Response(JSON.stringify({ error: "nope", decisions: [] }), { status: 400 });
    assert.deepEqual(await readResponseJson(res), { error: "nope", decisions: [] });
  });

  it("returns {} for empty bodies instead of throwing", async () => {
    const res = new Response("", { status: 500 });
    assert.deepEqual(await readResponseJson(res), {});
  });

  it("returns {} for non-JSON bodies instead of throwing", async () => {
    const res = new Response("<html>Internal Server Error</html>", { status: 500 });
    assert.deepEqual(await readResponseJson(res), {});
  });
});
