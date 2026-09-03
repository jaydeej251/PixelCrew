import assert from "node:assert/strict";
import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  cleanupExpiredSandboxes,
  LocalSandboxProvider,
  SandboxError,
  sandboxToolCallSchema,
} from "./index";

const cleanup: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-hq-sandbox-test-"));
  cleanup.push(root);
  return root;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(cleanup.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("LocalSandboxProvider paths and files", () => {
  it("rejects absolute, traversal, environment, Git, and dependency paths", async () => {
    const provider = new LocalSandboxProvider({ root: await tempRoot() });
    const attempt = await provider.create({ files: [] });
    for (const filePath of [
      "/etc/passwd",
      "../secret",
      ".env",
      ".env.local",
      ".git/config",
      "node_modules/pkg/index.js",
    ]) {
      await assert.rejects(
        provider.invoke(attempt, { type: "read", path: filePath }),
        (error: unknown) => error instanceof SandboxError && error.code === "INVALID_PATH",
      );
    }
  });

  it("blocks read, write, and cwd symlink escapes", async () => {
    const root = await tempRoot();
    const outside = path.join(root, "outside.txt");
    await writeFile(outside, "outside", "utf8");
    const provider = new LocalSandboxProvider({ root });
    const attempt = await provider.create({ files: [{ path: "inside.txt", content: "inside" }] });
    await symlink(outside, path.join(attempt.workspacePath, "escape.txt"));

    for (const call of [
      { type: "read", path: "escape.txt" },
      { type: "write", path: "escape.txt", content: "changed" },
      { type: "shell", executable: "node", args: ["inside.txt"], cwd: "escape.txt" },
    ]) {
      await assert.rejects(
        provider.invoke(attempt, call),
        (error: unknown) => error instanceof SandboxError && error.code === "INVALID_PATH",
      );
    }
    assert.equal(await readFile(outside, "utf8"), "outside");
  });

  it("hydrates approved files and exports bounded project files", async () => {
    const provider = new LocalSandboxProvider({ root: await tempRoot() });
    const attempt = await provider.create({
      files: new Map([
        ["src/index.ts", "export const initial = true;\n"],
        ["README.md", "# Seed\n"],
      ]),
    });
    await provider.invoke(attempt, {
      type: "write",
      path: "src/index.ts",
      content: "export const initial = false;\n",
    });
    await provider.invoke(attempt, {
      type: "write",
      path: "src/new.ts",
      content: "export const added = true;\n",
    });

    assert.deepEqual(await provider.exportFiles(attempt), [
      { path: "README.md", content: "# Seed\n" },
      { path: "src/index.ts", content: "export const initial = false;\n" },
      { path: "src/new.ts", content: "export const added = true;\n" },
    ]);
  });
});

describe("LocalSandboxProvider tools", () => {
  it("uses discriminated contracts and rejects non-allowlisted commands", async () => {
    assert.equal(sandboxToolCallSchema.safeParse({ type: "read", path: "a.txt" }).success, true);
    assert.equal(
      sandboxToolCallSchema.safeParse({ type: "shell", executable: "sh", args: ["-c", "id"] })
        .success,
      false,
    );

    const provider = new LocalSandboxProvider({ root: await tempRoot() });
    const attempt = await provider.create({ files: [] });
    await assert.rejects(
      provider.invoke(attempt, {
        type: "shell",
        executable: "npm",
        args: ["install", "some-package"],
      }),
      (error: unknown) => error instanceof SandboxError && error.code === "INVALID_TOOL_CALL",
    );
    await assert.rejects(
      provider.invoke(attempt, {
        type: "shell",
        executable: "node",
        args: ["-e", "console.log('unsafe')"],
      }),
      (error: unknown) => error instanceof SandboxError && error.code === "INVALID_TOOL_CALL",
    );
  });

  it("redacts secrets and truncates subprocess output", async () => {
    const provider = new LocalSandboxProvider({
      root: await tempRoot(),
      maxOutputBytes: 80,
    });
    const attempt = await provider.create({
      files: [
        {
          path: "print.js",
          content:
            "console.log('Bearer abcdefghijklmnopqrstuvwxyz DATABASE_URL=postgresql://u:p@host/db ' + 'x'.repeat(200));\n",
        },
      ],
    });
    const result = await provider.invoke(attempt, {
      type: "shell",
      executable: "node",
      args: ["print.js"],
    });

    assert.equal(result.success, true);
    assert.equal(result.truncated, true);
    assert.ok(Buffer.byteLength(result.stdout) <= 80);
    assert.doesNotMatch(result.stdout, /Bearer|postgresql:\/\/|DATABASE_URL/);
    assert.match(result.stdout, /\[REDACTED\]/);
  });

  it("times out bounded subprocesses", async () => {
    const provider = new LocalSandboxProvider({
      root: await tempRoot(),
      timeoutMs: 50,
    });
    const attempt = await provider.create({
      files: [{ path: "wait.js", content: "setTimeout(() => {}, 10_000);\n" }],
    });
    const result = await provider.invoke(attempt, {
      type: "shell",
      executable: "node",
      args: ["wait.js"],
    });
    assert.equal(result.success, false);
    assert.equal(result.timedOut, true);
  });

  it("returns a redacted Git diff including new files", async () => {
    const provider = new LocalSandboxProvider({ root: await tempRoot() });
    const attempt = await provider.create({
      files: [{ path: "index.js", content: "export const value = 1;\n" }],
    });
    await provider.invoke(attempt, {
      type: "write",
      path: "index.js",
      content: "export const value = 2;\n",
    });
    await provider.invoke(attempt, {
      type: "write",
      path: "new.txt",
      content: "new file\n",
    });
    const diff = await provider.diff(attempt);
    assert.match(diff, /-export const value = 1/);
    assert.match(diff, /\+export const value = 2/);
    assert.match(diff, /\+new file/);
  });

  it("enforces an aggregate tool-call budget", async () => {
    const provider = new LocalSandboxProvider({
      root: await tempRoot(),
      maxToolCalls: 1,
    });
    const attempt = await provider.create({ files: [{ path: "a.txt", content: "a" }] });
    await provider.invoke(attempt, { type: "read", path: "a.txt" });
    await assert.rejects(
      provider.invoke(attempt, { type: "read", path: "a.txt" }),
      (error: unknown) => error instanceof SandboxError && error.code === "LIMIT_EXCEEDED",
    );
  });
});

describe("LocalSandboxProvider lifecycle", () => {
  it("supports create, write, export, and idempotent destroy", async () => {
    const provider = new LocalSandboxProvider({ root: await tempRoot() });
    const attempt = await provider.create({ files: [] });
    await provider.invoke(attempt, {
      type: "write",
      path: "index.html",
      content: "<h1>Ready</h1>\n",
    });
    assert.deepEqual(await provider.exportFiles(attempt), [
      { path: "index.html", content: "<h1>Ready</h1>\n" },
    ]);
    await provider.destroy(attempt);
    await provider.destroy(attempt);
    await assert.rejects(provider.exportFiles(attempt), /not found/);
  });

  it("removes only expired sandbox workspaces", async () => {
    const root = await tempRoot();
    const provider = new LocalSandboxProvider({ root, now: () => 1_000 });
    const expired = await provider.create({ attemptId: "expired", files: [], ttlMs: 10 });
    const active = await provider.create({ attemptId: "active", files: [], ttlMs: 1_000 });
    assert.equal(await cleanupExpiredSandboxes(root, 1_100), 1);
    await assert.rejects(provider.exportFiles(expired), /not found/);
    assert.deepEqual(await provider.exportFiles(active), []);
  });
});
