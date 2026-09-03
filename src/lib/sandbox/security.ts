import { realpath, lstat } from "node:fs/promises";
import path from "node:path";
import { isProjectPath, normalizePath } from "../project-files";
import { SandboxError } from "./contracts";

const SECRET_PATTERNS: RegExp[] = [
  /\b(?:sk-or-v1-|sk-ant-|AIza)[A-Za-z0-9._-]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/gi,
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"'`]+/gi,
  /\b(?:[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|URL)|DATABASE_URL)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s]+)/g,
];

export function redactSandboxText(value: string): string {
  return SECRET_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, "[REDACTED]"),
    value,
  );
}

export function validateUserPath(raw: string): string {
  if (
    path.isAbsolute(raw) ||
    raw.startsWith("\\\\") ||
    raw.includes("\0") ||
    /(^|[/\\])(?:\.git|node_modules)(?:[/\\]|$)/i.test(raw) ||
    /(^|[/\\])\.env(?:\.[^/\\]*)?(?:[/\\]|$)/i.test(raw)
  ) {
    throw new SandboxError("INVALID_PATH", `Sandbox path is not allowed: ${raw}`);
  }
  const normalized = normalizePath(raw);
  if (!normalized || !isProjectPath(normalized)) {
    throw new SandboxError("INVALID_PATH", `Sandbox path is not allowed: ${raw}`);
  }
  return normalized;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function nearestExistingParent(candidate: string): Promise<string> {
  let current = candidate;
  for (;;) {
    try {
      await lstat(current);
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) throw new SandboxError("INVALID_PATH", "No safe path parent");
      current = parent;
    }
  }
}

export async function jailedPath(
  workspacePath: string,
  raw: string,
  mode: "read" | "write" | "cwd",
): Promise<string> {
  const normalized = validateUserPath(raw);
  const root = await realpath(workspacePath);
  const candidate = path.resolve(root, normalized);
  if (!isInside(root, candidate)) {
    throw new SandboxError("INVALID_PATH", `Path escapes sandbox: ${raw}`);
  }

  const existing = await nearestExistingParent(candidate);
  const resolvedExisting = await realpath(existing);
  if (!isInside(root, resolvedExisting)) {
    throw new SandboxError("INVALID_PATH", `Symlink escapes sandbox: ${raw}`);
  }

  if (mode !== "write") {
    let resolved: string;
    try {
      resolved = await realpath(candidate);
    } catch {
      throw new SandboxError("INVALID_PATH", `Sandbox path does not exist: ${raw}`);
    }
    if (!isInside(root, resolved)) {
      throw new SandboxError("INVALID_PATH", `Symlink escapes sandbox: ${raw}`);
    }
  } else {
    try {
      const stat = await lstat(candidate);
      if (stat.isSymbolicLink()) {
        throw new SandboxError("INVALID_PATH", `Writes through symlinks are forbidden: ${raw}`);
      }
    } catch (error) {
      if (error instanceof SandboxError) throw error;
    }
  }

  return candidate;
}

export function safeSandboxEnvironment(workspacePath: string): NodeJS.ProcessEnv {
  const safePath = [
    path.dirname(process.execPath),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ].join(path.delimiter);
  return {
    PATH: safePath,
    HOME: workspacePath,
    TMPDIR: workspacePath,
    TMP: workspacePath,
    TEMP: workspacePath,
    NODE_ENV: "test",
    npm_config_ignore_scripts: "true",
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
  };
}

export function truncateUtf8(
  value: string,
  maximumBytes: number,
): { value: string; truncated: boolean } {
  const buffer = Buffer.from(value);
  if (buffer.length <= maximumBytes) return { value, truncated: false };
  return {
    value: buffer.subarray(0, maximumBytes).toString("utf8"),
    truncated: true,
  };
}
