import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isBrowserLocalPixelCrewHost,
  isLocalPixelCrewRequest,
  isLoopbackHostname,
} from "./local-app-host";

describe("local PixelCrew host helpers", () => {
  it("detects loopback hostnames", () => {
    assert.equal(isLoopbackHostname("localhost"), true);
    assert.equal(isLoopbackHostname("127.0.0.1"), true);
    assert.equal(isLoopbackHostname("::1"), true);
    assert.equal(isLoopbackHostname("[::1]"), true);
    assert.equal(isLoopbackHostname("pixel-crew.online"), false);
    assert.equal(isLoopbackHostname("app.pixel-crew.online"), false);
  });

  it("treats forwarded production hosts as remote", () => {
    const live = new Request("http://127.0.0.1:3000/api/providers/ollama/models", {
      headers: { "x-forwarded-host": "app.pixel-crew.online", "x-forwarded-proto": "https" },
    });
    assert.equal(isLocalPixelCrewRequest(live), false);

    const local = new Request("http://127.0.0.1:3000/api/providers/ollama/models");
    assert.equal(isLocalPixelCrewRequest(local), true);
  });

  it("is false during SSR without a window", () => {
    assert.equal(isBrowserLocalPixelCrewHost(), false);
  });
});
