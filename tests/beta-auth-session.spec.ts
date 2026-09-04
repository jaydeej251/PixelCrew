import { test, expect, type BrowserContext } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";

loadEnvConfig(process.cwd());

/**
 * Marketing pages must never clear the session. Visiting /support then / looked
 * "logged out" because home always showed Log in CTAs — assert session + nav.
 */
test.describe("beta auth session across marketing pages", () => {
  const suffix = randomUUID();
  const email = `beta-session-${suffix}@example.com`;
  const password = "beta-session-test-password";
  let organizationId: string | null = null;
  let context: BrowserContext;

  test.afterAll(async () => {
    await context?.close();
    if (!organizationId) return;
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    try {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { email } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test("support → home keeps session; logout only via explicit API", async ({ browser }) => {
    context = await browser.newContext({
      extraHTTPHeaders: { "x-forwarded-for": `beta-session-${suffix}` },
    });

    const signup = await context.request.post("/api/auth/signup", {
      data: { email, password, name: "Beta Session" },
    });
    expect(signup.status()).toBe(200);

    const me1 = await (await context.request.get("/api/auth/me")).json();
    expect(me1.user?.email).toBe(email);
    organizationId = me1.user.organizationId as string;

    const workspace = await context.request.get("/api/workspace");
    expect(workspace.status()).toBe(200);
    const workspaceJson = await workspace.json();
    expect(workspaceJson.usage?.limit).toBeGreaterThan(0);
    expect(typeof workspaceJson.usage?.used).toBe("number");
    expect(workspaceJson.usage?.canRun).toBe(true);

    const page = await context.newPage();
    await page.goto("/app");
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();

    await page.goto("/support");
    await expect(page.getByRole("heading", { name: "Support" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open office" })).toBeVisible();

    const meAfterSupport = await (await context.request.get("/api/auth/me")).json();
    expect(meAfterSupport.user?.email).toBe(email);

    await page.goto("/");
    await expect(page.getByRole("link", { name: "Open office" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Account" })).toBeVisible();
    // Must not look logged out
    await expect(page.getByRole("link", { name: "Log in" })).toHaveCount(0);

    const meAfterHome = await (await context.request.get("/api/auth/me")).json();
    expect(meAfterHome.user?.email).toBe(email);

    for (const path of ["/pricing", "/terms", "/privacy", "/account"]) {
      await page.goto(path);
      const me = await (await context.request.get("/api/auth/me")).json();
      expect(me.user?.email, `session must survive ${path}`).toBe(email);
    }

    await page.goto("/account");
    await expect(page.getByText(email)).toBeVisible();

    // Explicit logout clears session
    const logout = await context.request.post("/api/auth/logout");
    expect(logout.status()).toBe(200);
    const meLoggedOut = await (await context.request.get("/api/auth/me")).json();
    expect(meLoggedOut.user).toBeNull();

    await page.goto("/");
    await expect(page.getByRole("link", { name: "Log in" }).first()).toBeVisible();
  });

  test("delete-account requires session and clears identity", async ({ browser }) => {
    const deleteSuffix = randomUUID();
    const deleteEmail = `beta-delete-${deleteSuffix}@example.com`;
    const deleteContext = await browser.newContext({
      extraHTTPHeaders: { "x-forwarded-for": `beta-delete-${deleteSuffix}` },
    });

    try {
      const unauth = await deleteContext.request.post("/api/auth/delete-account");
      expect(unauth.status()).toBe(401);

      const signup = await deleteContext.request.post("/api/auth/signup", {
        data: { email: deleteEmail, password, name: "Delete Me" },
      });
      expect(signup.status()).toBe(200);
      const me = await (await deleteContext.request.get("/api/auth/me")).json();
      expect(me.user?.email).toBe(deleteEmail);
      const orgId = me.user.organizationId as string;

      const deleted = await deleteContext.request.post("/api/auth/delete-account");
      expect(deleted.status()).toBe(200);
      const after = await (await deleteContext.request.get("/api/auth/me")).json();
      expect(after.user).toBeNull();

      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      try {
        expect(await prisma.user.findUnique({ where: { email: deleteEmail } })).toBeNull();
        expect(await prisma.organization.findUnique({ where: { id: orgId } })).toBeNull();
      } finally {
        await prisma.$disconnect();
      }
    } finally {
      await deleteContext.close();
    }
  });
});
