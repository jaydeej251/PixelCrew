import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_DESKS } from "../../lib/constants";
import { pickDeskForPosition } from "../../lib/office-desks";
import { cellRoom, deskClearOfDoors } from "./office-layout";

describe("office floor plan", () => {
  it("keeps every default desk off doorway tiles", () => {
    for (const desk of DEFAULT_DESKS) {
      assert.equal(
        deskClearOfDoors(desk.x, desk.y),
        true,
        `${desk.label} at ${desk.x},${desk.y} sits in a doorway`,
      );
    }
  });

  it("flags desks that sit in doorway openings", () => {
    assert.equal(deskClearOfDoors(3, 3), false);
    assert.equal(deskClearOfDoors(6, 8), false);
    assert.equal(deskClearOfDoors(6, 5), false);
  });

  it("places each default desk in its labeled room", () => {
    for (const desk of DEFAULT_DESKS) {
      assert.equal(cellRoom(desk.x, desk.y), desk.room, desk.label);
    }
  });

  it("seats Avery at reception and the executive at the CEO desk", () => {
    const desks = DEFAULT_DESKS.map((d, i) => ({ ...d, id: `d${i}` }));
    const taken = new Set<string>();
    const avery = pickDeskForPosition(desks, "dispatcher", taken);
    taken.add(avery!.id);
    const riley = pickDeskForPosition(desks, "executive", taken);
    assert.equal(avery?.label, "HQ AI");
    assert.equal(avery?.room, "Reception");
    assert.equal(riley?.label, "CEO Desk");
  });
});
