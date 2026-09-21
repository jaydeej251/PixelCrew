import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countInteractiveListeners, isShellStubAppJs } from "./js-stub";

const OFFICIAL_SHELL_STUB = `document.addEventListener("DOMContentLoaded", () => {
  console.log("UI shell ready");
});
`;

describe("isShellStubAppJs", () => {
  it("flags the official UI-shell stub", () => {
    assert.equal(isShellStubAppJs(OFFICIAL_SHELL_STUB), true);
  });

  it("flags padded DOMContentLoaded + UI shell ready (P0 false-negative)", () => {
    const padded = `${OFFICIAL_SHELL_STUB}
/* reserved for logic stage — do not remove */
/* palette / workspace / properties wiring goes here */
// TODO: create-node, drag, sockets, localStorage
`;
    assert.ok(padded.trim().length > 120, "fixture must exceed old length gate");
    assert.match(padded, /addEventListener/);
    assert.equal(isShellStubAppJs(padded), true);
    assert.equal(countInteractiveListeners(padded), 0);
  });

  it("does not flag a real interactive app.js", () => {
    const real = `
const nodes = [];
document.getElementById("add-node").addEventListener("click", () => {
  nodes.push({ id: crypto.randomUUID(), x: 40, y: 40 });
  render();
});
workspace.addEventListener("mousedown", onDragStart);
workspace.addEventListener("mousemove", onDragMove);
function render() { /* draw */ }
`;
    assert.equal(isShellStubAppJs(real), false);
    assert.ok(countInteractiveListeners(real) >= 3);
  });

  it("flags empty / tiny scripts", () => {
    assert.equal(isShellStubAppJs(""), true);
    assert.equal(isShellStubAppJs("console.log(1);\n"), true);
  });
});
