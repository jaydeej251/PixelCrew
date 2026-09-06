import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthError } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api-error";

async function bodyOf(res: Response): Promise<{ error?: string }> {
  return (await res.json()) as { error?: string };
}

function withSilentConsoleError(fn: () => void | Promise<void>) {
  const original = console.error;
  console.error = () => {};
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.error = original;
    });
}

describe("apiErrorResponse", () => {
  it("maps AuthError to JSON with auth status", async () => {
    const res = apiErrorResponse(new AuthError("Unauthorized"));
    assert.equal(res.status, 401);
    assert.deepEqual(await bodyOf(res), { error: "Unauthorized" });
  });

  it("returns provider key failures as JSON 400 instead of rethrowing", async () => {
    await withSilentConsoleError(async () => {
          const res = apiErrorResponse(
            new Error(
              "No valid API key for openrouter. Add OPENROUTER_API_KEY or OPEN_ROUTER_KEY to .env.local and restart the dev server, or save a key in the sidebar.",
            ),
          );
          assert.equal(res.status, 400);
          const body = await bodyOf(res);
          assert.match(String(body.error), /No valid API key for openrouter/);
    });
  });

  it("returns OpenRouter upstream failures as JSON 502", async () => {
    await withSilentConsoleError(async () => {
          const res = apiErrorResponse(
            new Error("OpenRouter: invalid API key. Check sk-or-v1- prefix in .env.local."),
          );
          assert.equal(res.status, 502);
          const body = await bodyOf(res);
          assert.match(String(body.error), /OpenRouter: invalid API key/);
    });
  });

  it("returns plan quality gate failures as JSON 400", async () => {
    await withSilentConsoleError(async () => {
          const res = apiErrorResponse(
            new Error(
              "This plan no longer matches the CEO goal and cannot be published.\nAutomated plan check: FAIL",
            ),
          );
          assert.equal(res.status, 400);
          const body = await bodyOf(res);
          assert.match(String(body.error), /cannot be published/);
    });
  });

  it("hides unknown internals behind a JSON 500", async () => {
    await withSilentConsoleError(async () => {
          const res = apiErrorResponse(new Error("prisma Unique constraint failed on the fields"));
          assert.equal(res.status, 500);
          assert.deepEqual(await bodyOf(res), { error: "Internal error" });
    });
  });

  it("never leaves the body empty for non-Error throws", async () => {
    await withSilentConsoleError(async () => {
          const res = apiErrorResponse("boom");
          assert.equal(res.status, 500);
          assert.deepEqual(await bodyOf(res), { error: "Internal error" });
    });
  });
});
