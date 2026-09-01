export type SandboxResult = {
  success: boolean;
  stdout: string;
  stderr: string;
  previewUrl?: string;
};

export async function executeInSandbox(
  _code: string,
  _language: string,
): Promise<SandboxResult> {
  return {
    success: false,
    stdout: "",
    stderr: "Sandbox execution is Phase 6. Configure E2B or Docker to enable.",
  };
}

export async function createGitHubPR(
  _repo: string,
  _branch: string,
  _title: string,
): Promise<{ url: string } | null> {
  return null;
}
