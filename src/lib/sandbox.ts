export type SandboxResult = {
  success: boolean;
  stdout: string;
  stderr: string;
  previewUrl?: string;
};

export function previewUrl(runId: string): string {
  return `/api/runs/${runId}/preview/`;
}

export async function executeInSandbox(
  _code: string,
  _language: string,
): Promise<SandboxResult> {
  return {
    success: false,
    stdout: "",
    stderr:
      "E2B/Docker sandbox is later Phase 6. Static exports preview in the office at /api/runs/:id/preview/.",
  };
}

export async function createGitHubPR(
  _repo: string,
  _branch: string,
  _title: string,
): Promise<{ url: string } | null> {
  return null;
}
