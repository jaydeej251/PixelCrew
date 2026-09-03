import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePreviewOrigins } from "./preview-origin";

describe("resolvePreviewOrigins", () => {
  it("uses the request origin for local development by default", () => {
    assert.deepEqual(
      resolvePreviewOrigins("http://localhost:3000/api/runs/1/preview", {
        NODE_ENV: "development",
      }),
      {
        appOrigin: "http://localhost:3000",
        previewOrigin: "http://localhost:3000",
      },
    );
  });

  it("requires distinct HTTPS origins in production", () => {
    assert.deepEqual(
      resolvePreviewOrigins("https://app.example/api/runs/1/preview", {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://app.example",
        PREVIEW_ORIGIN: "https://preview.example",
      }),
      {
        appOrigin: "https://app.example",
        previewOrigin: "https://preview.example",
      },
    );

    assert.throws(
      () =>
        resolvePreviewOrigins("https://app.example/api/runs/1/preview", {
          NODE_ENV: "production",
          NEXT_PUBLIC_APP_URL: "https://app.example",
          PREVIEW_ORIGIN: "https://app.example",
        }),
      /must differ/,
    );
  });
});
