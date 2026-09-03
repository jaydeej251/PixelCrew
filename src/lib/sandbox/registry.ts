import {
  SandboxError,
  type SandboxAttempt,
  type SandboxProvider,
  type SandboxToolResult,
} from "./contracts";
import { LocalSandboxProvider } from "./local";

type SandboxEnvironment = {
  NODE_ENV?: string;
  SANDBOX_ENABLED?: string;
  SANDBOX_PROVIDER?: string;
  SANDBOX_ROOT?: string;
  ALLOW_LOCAL_SANDBOX_IN_PRODUCTION?: string;
};

class UnavailableSandboxProvider implements SandboxProvider {
  constructor(
    readonly kind: "hosted" | "disabled",
    private readonly error: SandboxError,
  ) {}

  private unavailable(): never {
    throw new SandboxError(this.error.code, this.error.message);
  }

  async create(): Promise<SandboxAttempt> {
    return this.unavailable();
  }

  async invoke(): Promise<SandboxToolResult> {
    return this.unavailable();
  }

  async exportFiles(): Promise<never[]> {
    return this.unavailable();
  }

  async diff(): Promise<string> {
    return this.unavailable();
  }

  async destroy(): Promise<void> {
    return this.unavailable();
  }
}

export function getSandboxProvider(
  environment: SandboxEnvironment = process.env,
): SandboxProvider {
  const production = environment.NODE_ENV === "production";
  const enabled =
    environment.SANDBOX_ENABLED === "true" ||
    (!production && environment.SANDBOX_ENABLED !== "false");
  if (!enabled) {
    return new UnavailableSandboxProvider(
      "disabled",
      new SandboxError("SANDBOX_DISABLED", "Sandbox execution is disabled"),
    );
  }

  const provider = environment.SANDBOX_PROVIDER?.trim() || "local";
  if (provider === "hosted") {
    return new UnavailableSandboxProvider(
      "hosted",
      new SandboxError(
        "SANDBOX_NOT_CONFIGURED",
        "Hosted sandbox provider is not configured",
      ),
    );
  }
  if (provider !== "local") {
    return new UnavailableSandboxProvider(
      "disabled",
      new SandboxError("SANDBOX_NOT_CONFIGURED", `Unknown sandbox provider: ${provider}`),
    );
  }
  if (
    production &&
    environment.ALLOW_LOCAL_SANDBOX_IN_PRODUCTION !== "true"
  ) {
    return new UnavailableSandboxProvider(
      "disabled",
      new SandboxError(
        "SANDBOX_DISABLED",
        "Local sandbox requires explicit production opt-in",
      ),
    );
  }
  return new LocalSandboxProvider({ root: environment.SANDBOX_ROOT });
}
