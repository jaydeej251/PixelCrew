"use client";

import { useState } from "react";
import { ChevronDown, Download, ExternalLink, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyRunPreviewLink, openRunPreview } from "@/lib/run-preview";
import { hasPreviewableApp, type ArtifactLike } from "@/lib/project-files";
import { cn } from "@/lib/utils";

type RunDeliverableActionsProps = {
  runId: string;
  artifacts: ArtifactLike[];
  ceoGoal?: string;
  runFinished?: boolean;
  /** Compact row for office HUD; default matches Files panel chrome. */
  variant?: "hud" | "panel";
  className?: string;
};

function DownloadMenu({
  runId,
  compact,
}: {
  runId: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("relative", compact ? "" : "w-full")}>
      <Button
        type="button"
        variant="secondary"
        className={cn(
          compact ? "!h-8 !px-3" : "w-full !h-9",
          "!justify-between",
        )}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="inline-flex items-center gap-2">
          <Download size={14} />
          Download
        </span>
        <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
      </Button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-label="Close download menu"
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              "absolute z-20 mt-1 min-w-[220px] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-lg",
              compact ? "right-0" : "left-0 w-full",
            )}
            role="menu"
          >
            <a
              href={`/api/runs/${runId}/export?format=single`}
              download
              className="block px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <span className="font-medium">Save app (HTML)</span>
              <span className="mt-0.5 block text-[11px] text-zinc-500">
                One file you can open directly
              </span>
            </a>
            <a
              href={`/api/runs/${runId}/export`}
              download
              className="block px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <span className="font-medium">Download source (ZIP)</span>
              <span className="mt-0.5 block text-[11px] text-zinc-500">
                Project folder for developers
              </span>
            </a>
          </div>
        </>
      )}
    </div>
  );
}

export function RunDeliverableActions({
  runId,
  artifacts,
  ceoGoal = "",
  runFinished = false,
  variant = "panel",
  className,
}: RunDeliverableActionsProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const previewReady = hasPreviewableApp(artifacts, ceoGoal);
  const hud = variant === "hud";

  async function handleCopyLink() {
    setCopyState("idle");
    try {
      const ok = await copyRunPreviewLink(runId);
      setCopyState(ok ? "copied" : "error");
    } catch {
      setCopyState("error");
    }
  }

  if (hud) {
    return (
      <div className={className ?? "mt-2 flex w-full max-w-sm flex-col gap-2"}>
        {previewReady ? (
          <>
            <Button
              type="button"
              variant="primary"
              className="w-full !h-10"
              onClick={() => openRunPreview(runId)}
            >
              <ExternalLink size={14} />
              Open your app
            </Button>
            <p className="text-[11px] text-zinc-400">
              Opens in a new tab — use it like any website.
            </p>
            <Button
              type="button"
              variant="ghost"
              className="w-full !h-8 !justify-start !px-2 text-zinc-300"
              onClick={() => void handleCopyLink()}
            >
              <Link2 size={14} />
              {copyState === "copied"
                ? "Link copied"
                : copyState === "error"
                  ? "Could not copy link"
                  : "Copy link"}
            </Button>
            <DownloadMenu runId={runId} />
          </>
        ) : (
          runFinished && (
            <span className="text-[11px] text-zinc-400">No previewable HTML yet</span>
          )
        )}
      </div>
    );
  }

  return (
    <div className={className ?? "flex flex-wrap items-center gap-1"}>
      {previewReady ? (
        <Button
          type="button"
          variant="primary"
          className="!h-8 !px-3"
          onClick={() => openRunPreview(runId)}
        >
          <ExternalLink size={14} />
          Open your app
        </Button>
      ) : (
        runFinished && (
          <span className="px-1 text-[11px] text-zinc-500">No previewable HTML yet</span>
        )
      )}
      <DownloadMenu runId={runId} compact />
    </div>
  );
}
