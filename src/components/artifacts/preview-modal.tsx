"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type PreviewModalProps = {
  runId: string;
  onClose: () => void;
};

export function PreviewModal({ runId, onClose }: PreviewModalProps) {
  const src = `/api/runs/${runId}/preview`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950/90 p-4 backdrop-blur-sm">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-zinc-100">Preview</p>
            <p className="text-xs text-zinc-500">
              This is a preview in the browser — not a live website.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              Open in tab
            </a>
            <Button variant="ghost" className="!px-2 !py-1" onClick={onClose} type="button">
              <X size={14} />
              Close
            </Button>
          </div>
        </div>
        <iframe
          title="Run preview"
          src={src}
          className="min-h-0 flex-1 bg-white"
          sandbox="allow-scripts allow-forms allow-same-origin"
        />
      </div>
    </div>
  );
}
