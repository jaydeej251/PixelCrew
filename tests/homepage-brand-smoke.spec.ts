import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

test.describe("homepage PixelCrew brand", () => {
  test("signed-out home shows brand, office, pillars, and signup CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Your AI company, visible." })).toBeVisible();
    await expect(page.getByText("Hire by role")).toBeVisible();
    await expect(page.getByText("Specialists, not one chat")).toBeVisible();
    await expect(page.getByRole("img", { name: /Isometric PixelCrew office/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create free account" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Log in" }).first()).toBeVisible();
    // next/image rewrites src to /_next/image?url=...icon.png
    await expect(page.locator('header a[href="/"] img').first()).toBeVisible();

    const iconHrefs = await page.locator('link[rel="icon"]').evaluateAll((els) =>
      els.map((el) => el.getAttribute("href") ?? ""),
    );
    expect(iconHrefs.some((h) => h.includes("favicon") || h.includes("icon.png"))).toBe(true);
  });

  test("login and pricing show official logo", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.locator('header a[href="/"] img').first()).toBeVisible();

    await page.goto("/pricing");
    await expect(page.getByRole("heading", { name: "Pricing" })).toBeVisible();
    await expect(page.locator('header a[href="/"] img').first()).toBeVisible();
  });

  test("signed-in home shows Open office, not Create free account", async ({ browser }) => {
    const suffix = randomUUID();
    const email = `brand-home-${suffix}@example.com`;
    const password = "brand-home-test-password";
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-forwarded-for": `brand-home-${suffix}` },
    });

    try {
      const signup = await context.request.post("/api/auth/signup", {
        data: { email, password, name: "Brand Home" },
      });
      expect(signup.status()).toBe(200);

      const page = await context.newPage();
      await page.goto("/");
      await expect(page.getByRole("link", { name: "Open office" }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: "Create free account" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "My account" })).toBeVisible();

      await page.goto("/app");
      await expect(page.locator('header a[href="/app"] img').first()).toBeVisible();
    } finally {
      const me = await (await context.request.get("/api/auth/me")).json();
      const orgId = me.user?.organizationId as string | undefined;
      await context.close();
      if (orgId) {
        const { PrismaClient } = await import("@prisma/client");
        const prisma = new PrismaClient();
        try {
          await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
          await prisma.user.deleteMany({ where: { email } });
        } finally {
          await prisma.$disconnect();
        }
      }
    }
  });
});
