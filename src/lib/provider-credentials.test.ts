import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Documents the credential pick order used by findProviderCredential.
 * Prisma orderBy: isDefault desc, updatedAt desc, createdAt desc.
 */
describe("provider credential selection contract", () => {
  it("ranks default ahead of newer non-default rows", () => {
    const rows = [
      { id: "old-default", isDefault: true, updatedAt: 1 },
      { id: "new-other", isDefault: false, updatedAt: 99 },
    ];
    rows.sort((a, b) => {
      if (a.isDefault !== b.isDefault) return Number(b.isDefault) - Number(a.isDefault);
      return b.updatedAt - a.updatedAt;
    });
    assert.equal(rows[0].id, "old-default");
  });

  it("ranks the most recently updated row when none are default", () => {
    const rows = [
      { id: "local", isDefault: false, updatedAt: 10 },
      { id: "cloud", isDefault: false, updatedAt: 20 },
    ];
    rows.sort((a, b) => {
      if (a.isDefault !== b.isDefault) return Number(b.isDefault) - Number(a.isDefault);
      return b.updatedAt - a.updatedAt;
    });
    assert.equal(rows[0].id, "cloud");
  });
});
