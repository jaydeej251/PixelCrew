"use client";

import { useMemo, useState } from "react";
import { Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isProjectPath } from "@/lib/project-files";
import { PreviewModal } from "@/components/artifacts/preview-modal";

type Artifact = {
  id: string;
  type: string;
  title: string;
  content: string;
  filePath?: string | null;
  createdAt: string;
};

type ArtifactsPanelProps = {
  artifacts: Artifact[];
  totalTokens?: number;
  estCostUsd?: number;
  runId?: string;
  runFinished?: boolean;
};

export function ArtifactsPanel({
  artifacts,
  runId,
  runFinished = false,
}: ArtifactsPanelProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const open = artifacts.find((a) => a.id === openId) ?? null;

  const { files, drafts } = useMemo(() => {
    const files: Artifact[] = [];
    const drafts: Artifact[] = [];
    for (const a of artifacts) {
      if (isProjectPath(a.filePath)) files.push(a);
      else drafts.push(a);
    }
    files.sort((a, b) => (a.filePath ?? a.title).localeCompare(b.filePath ?? a.title));
    return { files, drafts };
  }, [artifacts]);

  const previewReady = files.length > 0 || runFinished;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-zinc-100">Files</p>
          <p className="text-[11px] text-zinc-500">
            {files.length > 0
              ? `${files.length} file${files.length === 1 ? "" : "s"}`
              : "Shows up as the team writes"}
          </p>
        </div>
        {runId && artifacts.length > 0 && (
          <div className="flex items-center gap-1">
            {previewReady && (
              <Button
                variant="ghost"
                className="!h-8 !px-2"
                type="button"
                onClick={() => setPreview(true)}
              >
                <Eye size={14} />
                Preview
              </Button>
            )}
            <a href={`/api/runs/${runId}/export`} download>
              <Button variant="ghost" className="!h-8 !px-2">
                <Download size={14} />
                Download
              </Button>
            </a>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {artifacts.length === 0 && (
          <p className="px-1 py-10 text-center text-sm text-zinc-600">
            {runFinished
              ? "This chat finished without files. Try starting again with a clearer request."
              : "When the team starts writing, your project files will appear here."}
          </p>
        )}

        {files.length > 0 && (
          <ul className="space-y-0.5">
            {files.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(openId === a.id ? null : a.id)}
                  className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-zinc-900"
                >
                  <p className="truncate font-mono text-[12px] text-zinc-300">
                    {a.filePath}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}

        {drafts.length > 0 && (
          <div className={files.length > 0 ? "mt-4" : ""}>
            <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-zinc-600">
              Notes
            </p>
            <ul className="space-y-1">
              {drafts.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(openId === a.id ? null : a.id)}
                    className="w-full rounded-lg px-2 py-2 text-left hover:bg-zinc-900"
                  >
                    <p className="text-sm text-zinc-200">{a.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{a.content}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {open && (
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-900 p-3 text-xs text-zinc-400">
            {open.content}
          </pre>
        )}
      </div>

      {runFinished && files.length > 0 && runId && (
        <div className="border-t border-zinc-800/80 p-3">
          <Button type="button" className="w-full" onClick={() => setPreview(true)}>
            <Eye size={14} />
            Preview your app
          </Button>
        </div>
      )}

      {preview && runId && <PreviewModal runId={runId} onClose={() => setPreview(false)} />}
    </div>
  );
}
