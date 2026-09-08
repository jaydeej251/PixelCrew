import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideTokenSpendGate,
  hasConfirmedSoftTokenSpend,
  hasOpenSoftTokenGate,
  TOKEN_HARD_GATE,
  TOKEN_SOFT_GATE,
  TOKEN_SOFT_GATE_TITLE,
  TOKEN_SPEND_CONFIRMED_TITLE,
} from "./token-spend-gate";

describe("token spend gates", () => {
  it("allows under the soft gate", () => {
    assert.deepEqual(decideTokenSpendGate(10_000, []), { action: "allow" });
  });

  it("soft-gates at soft limit until confirmed", () => {
    assert.deepEqual(decideTokenSpendGate(TOKEN_SOFT_GATE, []), {
      action: "soft_gate",
      tokens: TOKEN_SOFT_GATE,
    });
    assert.deepEqual(
      decideTokenSpendGate(TOKEN_SOFT_GATE, [{ title: TOKEN_SPEND_CONFIRMED_TITLE }]),
      { action: "allow" },
    );
  });

  it("hard-gates at hard limit even after confirm", () => {
    assert.deepEqual(
      decideTokenSpendGate(TOKEN_HARD_GATE, [{ title: TOKEN_SPEND_CONFIRMED_TITLE }]),
      { action: "hard_gate", tokens: TOKEN_HARD_GATE },
    );
  });

  it("detects open soft gate vs confirmed", () => {
    assert.equal(hasOpenSoftTokenGate([{ title: TOKEN_SOFT_GATE_TITLE }]), true);
    assert.equal(
      hasOpenSoftTokenGate([
        { title: TOKEN_SOFT_GATE_TITLE },
        { title: TOKEN_SPEND_CONFIRMED_TITLE },
      ]),
      false,
    );
    assert.equal(hasConfirmedSoftTokenSpend([{ title: TOKEN_SPEND_CONFIRMED_TITLE }]), true);
  });

  it("uses Claude-style warn-then-cap spacing", () => {
    assert.equal(TOKEN_SOFT_GATE, 100_000);
    assert.equal(TOKEN_HARD_GATE, 256_000);
    assert.ok(TOKEN_HARD_GATE > TOKEN_SOFT_GATE);
    // Room for a full office + several QA fix rounds before hard stop.
    assert.ok(TOKEN_HARD_GATE - TOKEN_SOFT_GATE >= 100_000);
  });
});
