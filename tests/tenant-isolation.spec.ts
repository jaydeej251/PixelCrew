import { test, expect, type BrowserContext } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";

loadEnvConfig(process.cwd());

const suffix = randomUUID();
const emails = [`gate1-a-${suffix}@example.com`, `gate1-b-${suffix}@example.com`];
const organizationIds: string[] = [];
let contexts: BrowserContext[] = [];

test.afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  } finally {
    await prisma.$disconnect();
  }
});

test("organization B cannot access organization A resources", async ({ browser }) => {
  const contextA = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": `gate1-a-${suffix}` },
  });
  const contextB = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": `gate1-b-${suffix}` },
  });
  contexts = [contextA, contextB];

  for (const [context, email] of [
    [contextA, emails[0]],
    [contextB, emails[1]],
  ] as const) {
    const response = await context.request.post("/api/auth/signup", {
      data: { email, password: "gate-one-test-password", name: "Gate One Test" },
    });
    expect(response.status()).toBe(200);
  }

  const identityA = await (await contextA.request.get("/api/auth/me")).json();
  const identityB = await (await contextB.request.get("/api/auth/me")).json();
  organizationIds.push(identityA.user.organizationId, identityB.user.organizationId);

  const workspaceAResponse = await contextA.request.get("/api/workspace");
  expect(workspaceAResponse.status()).toBe(200);
  const workspaceA = await workspaceAResponse.json();
  const workspaceAId = workspaceA.workspace.id as string;
  const agentAId = workspaceA.agents[0].id as string;
  const appPage = await contextA.newPage();
  await appPage.goto("/app");
  await expect(appPage.getByRole("button", { name: "Arrange" })).toBeVisible();
  await appPage.getByRole("button", { name: "Arrange" }).click();
  await expect(appPage.getByLabel("Layout name")).toHaveValue("HQ");
  await appPage.getByRole("button", { name: "Isometric" }).click();
  await appPage.getByRole("button", { name: "Floor" }).click();
  await appPage.locator(".iso-tile").first().click();
  await expect(appPage.getByRole("button", { name: "Save" })).toBeEnabled();

  await appPage.getByRole("button", { name: "New", exact: true }).click();
  const createDialog = appPage.getByRole("dialog", { name: "New office layout" });
  await createDialog.getByRole("textbox").fill("Browser arrange layout");
  await createDialog.getByRole("button", { name: "Create" }).click();
  await expect(appPage.getByLabel("Layout name")).toHaveValue("Browser arrange layout");
  await expect(appPage.getByRole("button", { name: "Done" })).toBeVisible();

  await appPage.getByRole("button", { name: "Restore HQ" }).first().click();
  const restoreDialog = appPage.getByRole("dialog", { name: "Restore original HQ?" });
  await restoreDialog.getByRole("button", { name: "Restore HQ" }).click();
  await expect(appPage.getByLabel("Layout name")).toHaveValue("HQ");
  await appPage.close();

  const layoutsResponse = await contextA.request.get("/api/workspace/layouts");
  expect(layoutsResponse.status()).toBe(200);
  const hqLayoutId = (await layoutsResponse.json()).layouts[0].id as string;
  const createdLayoutResponse = await contextA.request.post("/api/workspace/layouts", {
    data: { action: "create", name: "Isolation test layout", source: "copy", copyId: hqLayoutId },
  });
  expect(createdLayoutResponse.status()).toBe(201);
  const layoutAId = (await createdLayoutResponse.json()).id as string;

  const credentialResponse = await contextA.request.post("/api/credentials", {
    data: {
      workspaceId: workspaceAId,
      provider: "openrouter",
      label: "Gate One test",
      apiKey: "sk-or-v1-gate_one_test_key",
    },
  });
  expect(credentialResponse.status()).toBe(200);
  const credentialAId = (await credentialResponse.json()).id as string;

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const runA = await prisma.run.create({
    data: {
      workspaceId: workspaceAId,
      ceoGoal: "Generate a minimal static test page",
      title: "Gate One isolation fixture",
      status: "completed",
    },
  });
  await prisma.$disconnect();
  const runAId = runA.id;

  const probes: Array<Promise<{ status(): number }>> = [
    contextB.request.get(`/api/agents/${agentAId}`),
    contextB.request.patch(`/api/agents/${agentAId}`, { data: { name: "Compromised" } }),
    contextB.request.delete(`/api/agents/${agentAId}`),
    contextB.request.get(`/api/runs/${runAId}`),
    contextB.request.patch(`/api/runs/${runAId}`, { data: { title: "Compromised" } }),
    contextB.request.delete(`/api/runs/${runAId}`),
    contextB.request.get(`/api/runs/${runAId}/events`),
    contextB.request.get(`/api/runs/${runAId}/export`),
    contextB.request.get(`/api/runs/${runAId}/plan`),
    contextB.request.post(`/api/runs/${runAId}/plan`, {
      data: { action: "ask", message: "Expose the plan" },
    }),
    contextB.request.get(`/api/runs/${runAId}/preview`, { maxRedirects: 0 }),
    contextB.request.get(`/api/credentials?workspaceId=${workspaceAId}`),
    contextB.request.post("/api/credentials", {
      data: {
        workspaceId: workspaceAId,
        provider: "openrouter",
        label: "Compromised",
        apiKey: "sk-or-v1-compromised",
      },
    }),
    contextB.request.delete(`/api/credentials?id=${credentialAId}`),
    contextB.request.get(`/api/providers/status?workspaceId=${workspaceAId}`),
    contextB.request.post("/api/providers/test", {
      data: { workspaceId: workspaceAId, provider: "openrouter" },
    }),
    contextB.request.post(`/api/workspace/${workspaceAId}`, {
      data: { action: "update_goal", ceoGoal: "Compromised" },
    }),
    contextB.request.patch(`/api/workspace/layouts/${layoutAId}`, {
      data: { action: "activate" },
    }),
    contextB.request.patch(`/api/workspace/layouts/${layoutAId}`, {
      data: { action: "save", name: "Compromised", data: {} },
    }),
    contextB.request.delete(`/api/workspace/layouts/${layoutAId}`),
  ];

  for (const response of await Promise.all(probes)) {
    expect(response.status()).toBe(404);
  }

  const workspaceB = await (await contextB.request.get("/api/workspace")).json();
  const roleClient = new PrismaClient();
  await roleClient.membership.update({
    where: {
      userId_organizationId: {
        userId: identityB.user.id,
        organizationId: identityB.user.organizationId,
      },
    },
    data: { role: "member" },
  });
  await roleClient.$disconnect();
  const memberCredentialMutation = await contextB.request.post("/api/credentials", {
    data: {
      workspaceId: workspaceB.workspace.id,
      provider: "openrouter",
      label: "Member cannot save this",
      apiKey: "sk-or-v1-member-must-be-rejected",
    },
  });
  expect(memberCredentialMutation.status()).toBe(403);

  const ownerAgent = await contextA.request.get(`/api/agents/${agentAId}`);
  expect(ownerAgent.status()).toBe(200);
  const ownerRun = await contextA.request.get(`/api/runs/${runAId}`);
  expect(ownerRun.status()).toBe(200);
  const ownerLayoutSave = await contextA.request.patch(`/api/workspace/layouts/${layoutAId}`, {
    data: {
      action: "save",
      name: "Owner layout",
      data: { version: 1, floors: {}, walls: [], objects: [] },
    },
  });
  expect(ownerLayoutSave.status()).toBe(200);
  const ownerLayoutActivate = await contextA.request.patch(`/api/workspace/layouts/${layoutAId}`, {
    data: { action: "activate" },
  });
  expect(ownerLayoutActivate.status()).toBe(200);
  const protectedDelete = await contextA.request.delete(`/api/workspace/layouts/${hqLayoutId}`);
  expect(protectedDelete.status()).toBe(400);
  const ownerLayoutDelete = await contextA.request.delete(`/api/workspace/layouts/${layoutAId}`);
  expect(ownerLayoutDelete.status()).toBe(200);
  const ownerPreview = await contextA.request.get(`/api/runs/${runAId}/preview`, {
    maxRedirects: 0,
  });
  expect(ownerPreview.status()).toBe(307);
  expect(ownerPreview.headers().location).toContain("/api/previews/");
});

test("cross-site mutations are rejected before route handlers", async ({ playwright }) => {
  const request = await playwright.request.newContext({
    baseURL: "http://localhost:3000",
    extraHTTPHeaders: {
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    },
  });
  const response = await request.post("/api/auth/login", {
    data: { email: "victim@example.com", password: "not-the-password" },
  });
  expect(response.status()).toBe(403);
  await request.dispose();
});

test("persistent public endpoint rate limits return 429 with retry guidance", async ({
  playwright,
}) => {
  const request = await playwright.request.newContext({
    baseURL: "http://localhost:3000",
    extraHTTPHeaders: { "x-forwarded-for": `gate1-rate-${suffix}` },
  });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await request.post("/api/waitlist", { data: { email: "invalid" } });
    expect(response.status()).toBe(400);
  }
  const blocked = await request.post("/api/waitlist", { data: { email: "invalid" } });
  expect(blocked.status()).toBe(429);
  expect(Number(blocked.headers()["retry-after"])).toBeGreaterThan(0);
  await request.dispose();
});
