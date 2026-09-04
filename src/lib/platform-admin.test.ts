import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  parsePlatformAdminEmails,
  postAuthPath,
  resolvePlatformRole,
} from "./platform-admin";

const env = process.env as Record<string, string | undefined>;
const originalAllowlist = env.PLATFORM_ADMIN_EMAILS;

afterEach(() => {
  if (originalAllowlist === undefined) delete env.PLATFORM_ADMIN_EMAILS;
  else env.PLATFORM_ADMIN_EMAILS = originalAllowlist;
});

describe("parsePlatformAdminEmails", () => {
  it("returns empty set for blank input", () => {
    delete env.PLATFORM_ADMIN_EMAILS;
    assert.equal(parsePlatformAdminEmails("").size, 0);
    assert.equal(parsePlatformAdminEmails("  ").size, 0);
    assert.equal(parsePlatformAdminEmails().size, 0);
  });

  it("normalizes and splits emails", () => {
    const set = parsePlatformAdminEmails(" Ops@Example.com , other@x.test ");
    assert.equal(set.has("ops@example.com"), true);
    assert.equal(set.has("other@x.test"), true);
    assert.equal(set.size, 2);
  });
});

describe("resolvePlatformRole", () => {
  it("keeps stored ops and owner", () => {
    assert.equal(resolvePlatformRole("a@b.c", "ops", new Set()), "ops");
    assert.equal(resolvePlatformRole("a@b.c", "owner", new Set()), "owner");
  });

  it("upgrades none when email is allowlisted", () => {
    const allow = new Set(["admin@pixelcrew.test"]);
    assert.equal(resolvePlatformRole("Admin@PixelCrew.test", "none", allow), "ops");
    assert.equal(resolvePlatformRole("other@pixelcrew.test", "none", allow), "none");
  });
});

describe("postAuthPath", () => {
  it("sends ops to admin and tenants to app", () => {
    assert.equal(postAuthPath("ops"), "/admin");
    assert.equal(postAuthPath("owner"), "/admin");
    assert.equal(postAuthPath("none"), "/app");
  });
});
