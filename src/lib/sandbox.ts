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
  code: string,
  language: string,
): Promise<SandboxResult> {
  void code;
  void language;
  return {
    success: false,
    stdout: "",
    stderr:
      "E2B/Docker sandbox is later Phase 6. Static exports preview in the office at /api/runs/:id/preview/.",
  };
}

export async function createGitHubPR(
  repo: string,
  branch: string,
  title: string,
): Promise<{ url: string } | null> {
  void repo;
  void branch;
  void title;
  return null;
}
