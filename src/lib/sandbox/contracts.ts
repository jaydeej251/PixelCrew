import { z } from "zod";
import type { ProjectFile } from "../project-files";

export const MAX_SANDBOX_TOOL_CALLS = 40;
export const MAX_SANDBOX_LIST_ENTRIES = 500;
export const MAX_SANDBOX_OUTPUT_BYTES = 64_000;
export const DEFAULT_SANDBOX_TIMEOUT_MS = 15_000;
export const DEFAULT_SANDBOX_TTL_MS = 30 * 60_000;

const userPath = z.string().trim().min(1).max(180);
const cwd = userPath.optional();
const args = z.array(z.string().max(1_000)).max(32).default([]);

export const sandboxToolCallSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("read"), path: userPath }).strict(),
  z
    .object({
      type: z.literal("write"),
      path: userPath,
      content: z.string(),
    })
    .strict(),
  z.object({ type: z.literal("list"), path: userPath.optional() }).strict(),
  z
    .object({
      type: z.literal("shell"),
      executable: z.enum(["node", "npm"]),
      args,
      cwd,
    })
    .strict(),
  z
    .object({
      type: z.literal("install"),
      manager: z.literal("npm").default("npm"),
      cwd,
    })
    .strict(),
  z
    .object({
      type: z.literal("test"),
      manager: z.literal("npm").default("npm"),
      script: z.string().regex(/^[a-zA-Z0-9:_-]{1,64}$/).default("test"),
      cwd,
    })
    .strict(),
  z
    .object({
      type: z.literal("build"),
      manager: z.literal("npm").default("npm"),
      script: z.string().regex(/^[a-zA-Z0-9:_-]{1,64}$/).default("build"),
      cwd,
    })
    .strict(),
  z.object({ type: z.literal("diff") }).strict(),
]);

export type SandboxToolCall = z.infer<typeof sandboxToolCallSchema>;

export const sandboxToolResultSchema = z
  .object({
    type: z.enum(["read", "write", "list", "shell", "install", "test", "build", "diff"]),
    success: z.boolean(),
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number().int().nullable().optional(),
    timedOut: z.boolean().optional(),
    truncated: z.boolean().optional(),
    files: z.array(z.string()).optional(),
  })
  .strict();

export type SandboxToolResult = z.infer<typeof sandboxToolResultSchema>;

export type SandboxAttempt = {
  id: string;
  workspacePath: string;
  createdAt: string;
  expiresAt: string;
};

export type CreateSandboxOptions = {
  attemptId?: string;
  files: Iterable<ProjectFile> | Map<string, string>;
  ttlMs?: number;
};

export type SandboxProvider = {
  readonly kind: "local" | "hosted" | "disabled";
  create(options: CreateSandboxOptions): Promise<SandboxAttempt>;
  invoke(attempt: SandboxAttempt, call: unknown): Promise<SandboxToolResult>;
  exportFiles(attempt: SandboxAttempt): Promise<ProjectFile[]>;
  diff(attempt: SandboxAttempt): Promise<string>;
  destroy(attempt: SandboxAttempt): Promise<void>;
};

export class SandboxError extends Error {
  constructor(
    readonly code:
      | "SANDBOX_DISABLED"
      | "SANDBOX_NOT_CONFIGURED"
      | "INVALID_TOOL_CALL"
      | "INVALID_PATH"
      | "LIMIT_EXCEEDED"
      | "ATTEMPT_EXPIRED"
      | "ATTEMPT_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "SandboxError";
  }
}
