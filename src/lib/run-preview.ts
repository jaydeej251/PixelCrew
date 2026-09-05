/** Authenticated hop that redirects to the signed preview host. */
export function runPreviewPath(runId: string): string {
  return `/api/runs/${runId}/preview`;
}

/** Open the generated app in a full browser tab (primary non-dev deliverable). */
export function openRunPreview(runId: string): void {
  window.open(runPreviewPath(runId), "_blank", "noopener,noreferrer");
}

/** Fetch a shareable preview URL and copy it to the clipboard. */
export async function copyRunPreviewLink(runId: string): Promise<boolean> {
  const res = await fetch(`/api/runs/${runId}/preview-url`);
  if (!res.ok) return false;
  const data = (await res.json()) as { url?: string };
  if (!data.url) return false;
  await navigator.clipboard.writeText(data.url);
  return true;
}
