import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  isProjectPath,
  MAX_FILE_BYTES,
  MAX_PROJECT_FILES,
  normalizePath,
  type ProjectFile,
} from "../project-files";
import {
  DEFAULT_SANDBOX_TIMEOUT_MS,
  DEFAULT_SANDBOX_TTL_MS,
  MAX_SANDBOX_LIST_ENTRIES,
  MAX_SANDBOX_OUTPUT_BYTES,
  MAX_SANDBOX_TOOL_CALLS,
  SandboxError,
  sandboxToolCallSchema,
  sandboxToolResultSchema,
  type CreateSandboxOptions,
  type SandboxAttempt,
  type SandboxProvider,
  type SandboxToolResult,
} from "./contracts";
import {
  jailedPath,
  redactSandboxText,
  safeSandboxEnvironment,
  truncateUtf8,
  validateUserPath,
} from "./security";

const DIRECTORY_PREFIX = "agent-hq-sandbox-";
const METADATA_PATH = path.join(".git", "agent-hq-sandbox.json");

type LocalSandboxOptions = {
  root?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  maxToolCalls?: number;
  now?: () => number;
};

type ProcessResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
};

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return Number.isFinite(value) && value! >= minimum
    ? Math.min(Math.floor(value!), maximum)
    : fallback;
}

async function runProcess(options: {
  executable: string;
  args: string[];
  cwd: string;
  workspacePath: string;
  timeoutMs: number;
  maxOutputBytes: number;
}): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.executable, options.args, {
      cwd: options.cwd,
      env: safeSandboxEnvironment(options.workspacePath),
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;
    let timedOut = false;

    const capture = (chunks: Buffer[], current: () => number, set: (n: number) => void) =>
      (chunk: Buffer) => {
        const remaining = options.maxOutputBytes - current();
        if (remaining <= 0) {
          truncated = true;
          return;
        }
        const captured = chunk.subarray(0, remaining);
        chunks.push(captured);
        set(current() + captured.length);
        if (captured.length < chunk.length) truncated = true;
      };

    child.stdout.on("data", capture(stdout, () => stdoutBytes, (n) => (stdoutBytes = n)));
    child.stderr.on("data", capture(stderr, () => stderrBytes, (n) => (stderrBytes = n)));
    child.once("error", reject);

    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform !== "win32" && child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      } else {
        child.kill("SIGKILL");
      }
    }, options.timeoutMs);
    timer.unref();

    child.once("close", (exitCode) => {
      clearTimeout(timer);
      resolve({
        stdout: redactSandboxText(Buffer.concat(stdout).toString("utf8")),
        stderr: redactSandboxText(Buffer.concat(stderr).toString("utf8")),
        exitCode,
        timedOut,
        truncated,
      });
    });
  });
}

function filesFromInput(input: CreateSandboxOptions["files"]): ProjectFile[] {
  if (input instanceof Map) {
    return [...input].map(([filePath, content]) => ({ path: filePath, content }));
  }
  return [...input];
}

function metadataPath(workspacePath: string): string {
  return path.join(workspacePath, METADATA_PATH);
}

async function writeMetadata(attempt: SandboxAttempt): Promise<void> {
  await writeFile(metadataPath(attempt.workspacePath), JSON.stringify(attempt), {
    encoding: "utf8",
    mode: 0o600,
  });
}

/**
 * Process-level guardrails for development and controlled hosts.
 * This provider is not container-grade isolation and must not run untrusted code on a shared host.
 */
export class LocalSandboxProvider implements SandboxProvider {
  readonly kind = "local" as const;
  readonly root: string;
  private readonly timeoutMs: number;
  private readonly maxOutputBytes: number;
  private readonly maxToolCalls: number;
  private readonly now: () => number;
  private readonly callCounts = new Map<string, number>();

  constructor(options: LocalSandboxOptions = {}) {
    this.root = path.resolve(
      options.root ?? process.env.SANDBOX_ROOT ?? path.join(process.cwd(), ".sandboxes"),
    );
    this.timeoutMs = boundedInteger(
      options.timeoutMs ??
        (process.env.SANDBOX_TIMEOUT_MS
          ? Number(process.env.SANDBOX_TIMEOUT_MS)
          : undefined),
      DEFAULT_SANDBOX_TIMEOUT_MS,
      1,
      120_000,
    );
    this.maxOutputBytes = boundedInteger(
      options.maxOutputBytes,
      MAX_SANDBOX_OUTPUT_BYTES,
      1,
      1_000_000,
    );
    this.maxToolCalls = boundedInteger(
      options.maxToolCalls,
      MAX_SANDBOX_TOOL_CALLS,
      1,
      100,
    );
    this.now = options.now ?? Date.now;
  }

  private async run(
    attempt: SandboxAttempt,
    executable: string,
    args: string[],
    cwd = attempt.workspacePath,
  ): Promise<ProcessResult> {
    return runProcess({
      executable,
      args,
      cwd,
      workspacePath: attempt.workspacePath,
      timeoutMs: this.timeoutMs,
      maxOutputBytes: this.maxOutputBytes,
    });
  }

  private async validateAttempt(attempt: SandboxAttempt): Promise<void> {
    const expected = path.join(this.root, `${DIRECTORY_PREFIX}${attempt.id}`);
    if (path.resolve(attempt.workspacePath) !== expected) {
      throw new SandboxError("ATTEMPT_NOT_FOUND", "Sandbox attempt does not belong to provider");
    }
    let stored: SandboxAttempt;
    try {
      stored = JSON.parse(await readFile(metadataPath(expected), "utf8")) as SandboxAttempt;
    } catch {
      throw new SandboxError("ATTEMPT_NOT_FOUND", "Sandbox attempt was not found");
    }
    if (stored.id !== attempt.id || stored.workspacePath !== expected) {
      throw new SandboxError("ATTEMPT_NOT_FOUND", "Sandbox attempt metadata is invalid");
    }
    if (Date.parse(stored.expiresAt) <= this.now()) {
      throw new SandboxError("ATTEMPT_EXPIRED", "Sandbox attempt has expired");
    }
  }

  async create(options: CreateSandboxOptions): Promise<SandboxAttempt> {
    const id = options.attemptId ?? randomUUID();
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) {
      throw new SandboxError("INVALID_PATH", "Invalid sandbox attempt id");
    }
    const files = filesFromInput(options.files);
    if (files.length > MAX_PROJECT_FILES) {
      throw new SandboxError("LIMIT_EXCEEDED", "Too many seed files");
    }

    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const workspacePath = path.join(this.root, `${DIRECTORY_PREFIX}${id}`);
    await mkdir(workspacePath, { recursive: false, mode: 0o700 });

    const createdAt = new Date(this.now());
    const ttlMs = boundedInteger(
      options.ttlMs,
      DEFAULT_SANDBOX_TTL_MS,
      1,
      24 * 60 * 60_000,
    );
    const attempt: SandboxAttempt = {
      id,
      workspacePath,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + ttlMs).toISOString(),
    };

    try {
      for (const file of files) {
        const normalized = validateUserPath(file.path);
        if (Buffer.byteLength(file.content) > MAX_FILE_BYTES) {
          throw new SandboxError("LIMIT_EXCEEDED", `Seed file is too large: ${normalized}`);
        }
        const target = await jailedPath(workspacePath, normalized, "write");
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, file.content, "utf8");
      }

      await this.run(attempt, "git", ["init", "--quiet"]);
      await this.run(attempt, "git", ["checkout", "--quiet", "--orphan", "sandbox-seed"]);
      await this.run(attempt, "git", ["config", "--local", "user.name", "Agent HQ Sandbox"]);
      await this.run(attempt, "git", [
        "config",
        "--local",
        "user.email",
        "sandbox@agent-hq.invalid",
      ]);
      await this.run(attempt, "git", ["add", "--all"]);
      const commit = await this.run(attempt, "git", [
        "commit",
        "--quiet",
        "--allow-empty",
        "-m",
        "sandbox seed",
      ]);
      if (commit.exitCode !== 0) throw new Error(`Unable to commit sandbox seed: ${commit.stderr}`);
      await writeMetadata(attempt);
      this.callCounts.set(id, 0);
      return attempt;
    } catch (error) {
      await rm(workspacePath, { recursive: true, force: true });
      throw error;
    }
  }

  private async allowedCommand(
    attempt: SandboxAttempt,
    call: Extract<ReturnType<typeof sandboxToolCallSchema.parse>, { type: "shell" }>,
  ): Promise<{ executable: string; args: string[] }> {
    if (call.executable === "node") {
      const script = call.args[0];
      if (!script || script.startsWith("-") || !/\.[cm]?js$/i.test(script)) {
        throw new SandboxError("INVALID_TOOL_CALL", "Node must execute a workspace script");
      }
      return {
        executable: "node",
        args: [await jailedPath(attempt.workspacePath, script, "read"), ...call.args.slice(1)],
      };
    }
    const action = call.args[0];
    if (!action || !new Set(["run", "test", "--version"]).has(action)) {
      throw new SandboxError("INVALID_TOOL_CALL", "npm shell action is not allowed");
    }
    if (call.args.some((arg) => /^(?:i|install|ci|add|exec|publish|pack|login|config)$/.test(arg))) {
      throw new SandboxError("INVALID_TOOL_CALL", "Package or network action is not allowed");
    }
    if (
      action === "run" &&
      (!/^[a-zA-Z0-9:_-]{1,64}$/.test(call.args[1] ?? "") ||
        /^(?:pre|post)?install$/i.test(call.args[1] ?? ""))
    ) {
      throw new SandboxError("INVALID_TOOL_CALL", "npm lifecycle action is not allowed");
    }
    if (action === "--version" && call.args.length !== 1) {
      throw new SandboxError("INVALID_TOOL_CALL", "npm version takes no arguments");
    }
    return call;
  }

  async invoke(attempt: SandboxAttempt, input: unknown): Promise<SandboxToolResult> {
    await this.validateAttempt(attempt);
    const parsed = sandboxToolCallSchema.safeParse(input);
    if (!parsed.success) {
      throw new SandboxError("INVALID_TOOL_CALL", parsed.error.message);
    }
    const calls = (this.callCounts.get(attempt.id) ?? 0) + 1;
    if (calls > this.maxToolCalls) {
      throw new SandboxError("LIMIT_EXCEEDED", "Sandbox tool-call budget exhausted");
    }
    this.callCounts.set(attempt.id, calls);
    const call = parsed.data;

    if (call.type === "read") {
      const target = await jailedPath(attempt.workspacePath, call.path, "read");
      const stat = await lstat(target);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) {
        throw new SandboxError("LIMIT_EXCEEDED", "Sandbox file cannot be read");
      }
      const output = truncateUtf8(await readFile(target, "utf8"), this.maxOutputBytes);
      return sandboxToolResultSchema.parse({
        type: call.type,
        success: true,
        stdout: redactSandboxText(output.value),
        stderr: "",
        truncated: output.truncated,
      });
    }

    if (call.type === "write") {
      if (Buffer.byteLength(call.content) > MAX_FILE_BYTES) {
        throw new SandboxError("LIMIT_EXCEEDED", "Sandbox file is too large");
      }
      const target = await jailedPath(attempt.workspacePath, call.path, "write");
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, call.content, "utf8");
      return sandboxToolResultSchema.parse({
        type: call.type,
        success: true,
        stdout: "",
        stderr: "",
      });
    }

    if (call.type === "list") {
      const root = call.path
        ? await jailedPath(attempt.workspacePath, call.path, "read")
        : attempt.workspacePath;
      const files: string[] = [];
      const visit = async (directory: string): Promise<void> => {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          if (entry.name === ".git" || entry.name === "node_modules" || entry.name.startsWith(".env")) {
            continue;
          }
          const absolute = path.join(directory, entry.name);
          const relative = path.relative(attempt.workspacePath, absolute).replaceAll(path.sep, "/");
          if (!isProjectPath(relative)) continue;
          if (entry.isSymbolicLink()) continue;
          files.push(relative + (entry.isDirectory() ? "/" : ""));
          if (files.length >= MAX_SANDBOX_LIST_ENTRIES) return;
          if (entry.isDirectory()) await visit(absolute);
          if (files.length >= MAX_SANDBOX_LIST_ENTRIES) return;
        }
      };
      await visit(root);
      files.sort();
      return sandboxToolResultSchema.parse({
        type: call.type,
        success: true,
        stdout: "",
        stderr: "",
        files,
        truncated: files.length >= MAX_SANDBOX_LIST_ENTRIES,
      });
    }

    if (call.type === "diff") {
      return sandboxToolResultSchema.parse({
        type: call.type,
        success: true,
        stdout: await this.diff(attempt),
        stderr: "",
      });
    }

    const cwd = call.cwd
      ? await jailedPath(attempt.workspacePath, call.cwd, "cwd")
      : attempt.workspacePath;
    let command: { executable: string; args: string[] };
    if (call.type === "shell") {
      command = await this.allowedCommand(attempt, call);
    } else if (call.type === "install") {
      command = {
        executable: "npm",
        args: ["install", "--ignore-scripts", "--offline", "--no-audit", "--no-fund"],
      };
    } else {
      command = { executable: "npm", args: ["run", call.script] };
    }
    const result = await this.run(attempt, command.executable, command.args, cwd);
    return sandboxToolResultSchema.parse({
      type: call.type,
      success: result.exitCode === 0 && !result.timedOut,
      ...result,
    });
  }

  async exportFiles(attempt: SandboxAttempt): Promise<ProjectFile[]> {
    await this.validateAttempt(attempt);
    const files: ProjectFile[] = [];
    const visit = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.name === ".git" || entry.name === "node_modules" || entry.name.startsWith(".env")) {
          continue;
        }
        const absolute = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          await visit(absolute);
          continue;
        }
        const relative = path.relative(attempt.workspacePath, absolute).replaceAll(path.sep, "/");
        const normalized = normalizePath(relative);
        if (!normalized || !isProjectPath(normalized)) continue;
        const stat = await lstat(absolute);
        if (!stat.isFile() || stat.size > MAX_FILE_BYTES) continue;
        if (files.length >= MAX_PROJECT_FILES) {
          throw new SandboxError("LIMIT_EXCEEDED", "Sandbox export has too many files");
        }
        files.push({
          path: normalized,
          content: redactSandboxText(await readFile(absolute, "utf8")),
        });
      }
    };
    await visit(attempt.workspacePath);
    return files.sort((a, b) => a.path.localeCompare(b.path));
  }

  async diff(attempt: SandboxAttempt): Promise<string> {
    await this.validateAttempt(attempt);
    await this.run(attempt, "git", ["add", "--intent-to-add", "--all"]);
    const result = await this.run(attempt, "git", [
      "diff",
      "--no-ext-diff",
      "--no-color",
      "HEAD",
      "--",
      ".",
    ]);
    const output = truncateUtf8(result.stdout, this.maxOutputBytes);
    return redactSandboxText(output.value);
  }

  async destroy(attempt: SandboxAttempt): Promise<void> {
    const expected = path.join(this.root, `${DIRECTORY_PREFIX}${attempt.id}`);
    if (path.resolve(attempt.workspacePath) !== expected) return;
    await rm(expected, { recursive: true, force: true });
    this.callCounts.delete(attempt.id);
  }
}

export async function cleanupExpiredSandboxes(
  root = process.env.SANDBOX_ROOT ?? path.join(process.cwd(), ".sandboxes"),
  now = Date.now(),
): Promise<number> {
  let entries;
  try {
    entries = await readdir(path.resolve(root), { withFileTypes: true });
  } catch {
    return 0;
  }
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(DIRECTORY_PREFIX)) continue;
    const workspacePath = path.join(path.resolve(root), entry.name);
    try {
      const canonicalRoot = await realpath(path.resolve(root));
      const canonicalWorkspace = await realpath(workspacePath);
      if (path.dirname(canonicalWorkspace) !== canonicalRoot) continue;
      const metadata = JSON.parse(
        await readFile(metadataPath(canonicalWorkspace), "utf8"),
      ) as SandboxAttempt;
      if (Date.parse(metadata.expiresAt) > now) continue;
      await rm(canonicalWorkspace, { recursive: true, force: true });
      removed++;
    } catch {
      // Unknown directories are not ours to remove.
    }
  }
  return removed;
}
