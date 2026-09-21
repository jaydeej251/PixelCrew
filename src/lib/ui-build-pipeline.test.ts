import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAppLogicTitle,
  isUiShellTitle,
  needsStagedUiBuild,
  IMPLEMENT_APP_LOGIC_TITLE,
  IMPLEMENT_UI_SHELL_TITLE,
} from "./ui-build-pipeline";

describe("ui build pipeline", () => {
  it("stages complex node/canvas editor goals", () => {
    assert.equal(
      needsStagedUiBuild(
        "Build a fully static node-based visual flow editor called PixelFlow with an infinite zoomable canvas, sidebar nodes, and a properties panel.",
      ),
      true,
    );
    assert.equal(needsStagedUiBuild("Build a simple todo list with localStorage."), false);
  });

  it("recognizes staged implement titles", () => {
    assert.equal(isUiShellTitle(IMPLEMENT_UI_SHELL_TITLE), true);
    assert.equal(isAppLogicTitle(IMPLEMENT_APP_LOGIC_TITLE), true);
    assert.equal(isUiShellTitle("Implement product work from the plan"), false);
  });
});
