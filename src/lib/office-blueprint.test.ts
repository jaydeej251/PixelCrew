import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyBlueprintEdit,
  cyclePlacementYaw,
  edgeFromOffset,
  edgeLine,
  emptyBlueprint,
  erasePreviewAt,
  hqBlueprint,
  normalizePlacementYaw,
  sanitizeBlueprint,
  seatableDesks,
  wallMatchesEdge,
} from "./office-blueprint";

describe("office blueprint", () => {
  it("snapshots HQ with painted floors, walls, and seatable desks", () => {
    const hq = hqBlueprint();
    assert.equal(hq.version, 1);
    assert.ok(Object.keys(hq.floors).length >= 100);
    assert.ok(hq.walls.length > 10);
    const desks = seatableDesks(hq);
    assert.ok(desks.some((d) => d.label === "CEO Desk"));
    assert.ok(desks.some((d) => d.label === "HQ AI"));
  });

  it("paints floors, places walls and desks, then erases them", () => {
    let bp = emptyBlueprint();
    bp = applyBlueprintEdit(bp, "floor", "#2d4a8a", 3, 4);
    assert.equal(bp.floors["3,4"], "#2d4a8a");

    bp = applyBlueprintEdit(bp, "wall", "#f5f5f4", 3, 4, "n");
    assert.equal(bp.walls.length, 1);

    bp = applyBlueprintEdit(bp, "desk", "#b45309", 3, 4);
    assert.equal(seatableDesks(bp).length, 1);

    bp = applyBlueprintEdit(bp, "erase", "#000000", 3, 4);
    assert.equal(seatableDesks(bp).length, 0);
    bp = applyBlueprintEdit(bp, "erase", "#000000", 3, 4, "n");
    assert.equal(bp.walls.length, 0);
  });

  it("picks nearest tile edge from click offset within the cell", () => {
    assert.equal(edgeFromOffset(0, -0.4), "n");
    assert.equal(edgeFromOffset(0, 0.4), "s");
    assert.equal(edgeFromOffset(-0.4, 0), "w");
    assert.equal(edgeFromOffset(0.4, 0), "e");
    // Dominant axis wins when both are non-zero
    assert.equal(edgeFromOffset(0.1, -0.5), "n");
    assert.equal(edgeFromOffset(0.5, -0.1), "e");

    const north = edgeLine(3, 4, "n");
    assert.equal(north.axis, "h");
    assert.equal(north.a, 3.5);

    let bp = emptyBlueprint();
    bp = applyBlueprintEdit(bp, "wall", "#f5f5f4", 3, 4, "e");
    assert.equal(bp.walls[0]?.axis, "v");
    assert.equal(bp.walls[0]?.a, 3.5);
    bp = applyBlueprintEdit(bp, "wall", "#f5f5f4", 3, 4, "w");
    assert.equal(bp.walls.length, 2);
    assert.ok(bp.walls.some((w) => w.axis === "v" && w.a === 2.5));
  });

  it("stores placement yaw and cycles clockwise in quarter turns", () => {
    assert.equal(normalizePlacementYaw(0), 0);
    assert.equal(normalizePlacementYaw(Math.PI / 2), Math.PI / 2);
    assert.equal(cyclePlacementYaw(0), (3 * Math.PI) / 2);
    assert.equal(cyclePlacementYaw((3 * Math.PI) / 2), Math.PI);
    assert.equal(cyclePlacementYaw(Math.PI), Math.PI / 2);
    assert.equal(cyclePlacementYaw(Math.PI / 2), 0);

    let bp = emptyBlueprint();
    bp = applyBlueprintEdit(bp, "chair", "#292524", 2, 2, "n", Math.PI / 2);
    assert.equal(bp.objects[0]?.yaw, Math.PI / 2);
    bp = applyBlueprintEdit(bp, "desk", "#b45309", 5, 5, "n", 0);
    assert.equal(bp.objects.find((o) => o.kind === "desk")?.yaw, 0);
  });

  it("erase preview only marks walls that exist; HQ walls match nearby tile edges", () => {
    let bp = emptyBlueprint();
    // No walls / clear one floor paint for empty-lot semantics
    bp.floors = {};
    let preview = erasePreviewAt(bp, 3, 4, "n");
    assert.equal(preview.hasWall, false);
    assert.equal(preview.hasFloor, false);
    assert.equal(preview.hasObject, false);

    bp = applyBlueprintEdit(bp, "wall", "#f5f5f4", 3, 4, "n");
    preview = erasePreviewAt(bp, 3, 4, "n");
    assert.equal(preview.hasWall, true);
    preview = erasePreviewAt(bp, 3, 4, "s");
    assert.equal(preview.hasWall, false);

    // HQ interior wall at a=2.75 should match tile edge near 2.5
    const hq = hqBlueprint();
    assert.ok(hq.walls.some((w) => Math.abs(w.a - 2.75) < 0.01));
    assert.ok(wallMatchesEdge(hq.walls.find((w) => Math.abs(w.a - 2.75) < 0.01)!, 2, 3, "n"));
    const erased = applyBlueprintEdit(hq, "erase", "#000000", 2, 3, "n");
    assert.ok(erased.walls.length < hq.walls.length);
  });

  it("drops malformed json and keeps hex colors", () => {
    const clean = sanitizeBlueprint({
      floors: { "1,1": "red", "2,2": "#00ff00", "99,99": "#ffffff" },
      walls: [{ id: "w", axis: "h", a: 1, b0: 0, b1: 1, color: "#cccccc" }, { axis: "nope" }],
      objects: [{ id: "o", kind: "desk", x: 1, y: 2, label: "PM-1" }, { kind: "spaceship", x: 0, y: 0 }],
    });
    assert.equal(clean.floors["1,1"], undefined);
    assert.equal(clean.floors["2,2"], "#00ff00");
    assert.equal(clean.floors["99,99"], undefined);
    assert.equal(clean.walls.length, 1);
    assert.equal(clean.objects.length, 1);
    assert.equal(clean.objects[0]?.kind, "desk");
  });
});
