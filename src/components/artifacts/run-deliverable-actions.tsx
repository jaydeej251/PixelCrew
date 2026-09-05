"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Download, ExternalLink, Link2, MoreHorizontal } from "lucide-react";
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
  onRequestChanges?: () => void;
  onRestart?: () => void;
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

function HudMoreMenu({
  runId,
  onRequestChanges,
  onRestart,
  onCopyLink,
  copyState,
  showPreviewActions = true,
}: {
  runId: string;
  onRequestChanges?: () => void;
  onRestart?: () => void;
  onCopyLink: () => void;
  copyState: "idle" | "copied" | "error";
  /** When false, hide copy/download (no previewable app yet). */
  showPreviewActions?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasItems =
    showPreviewActions || Boolean(onRequestChanges) || Boolean(onRestart);

  if (!hasItems) return null;

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        className="w-full !h-8 !justify-between !px-2 text-zinc-300"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="inline-flex items-center gap-2">
          <MoreHorizontal size={14} />
          More
        </span>
        <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
      </Button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-label="Close more menu"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 z-20 mt-1 w-full min-w-[220px] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-lg"
            role="menu"
          >
            {showPreviewActions && (
              <>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onCopyLink();
                  }}
                >
                  <Link2 size={14} />
                  {copyState === "copied"
                    ? "Link copied"
                    : copyState === "error"
                      ? "Could not copy link"
                      : "Copy link"}
                </button>
                <a
                  href={`/api/runs/${runId}/export?format=single`}
                  download
                  className="block px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                >
                  Save app (HTML)
                </a>
                <a
                  href={`/api/runs/${runId}/export`}
                  download
                  className="block px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                >
                  Download source (ZIP)
                </a>
              </>
            )}
            {onRequestChanges && (
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onRequestChanges();
                }}
              >
                Request changes
              </button>
            )}
            {onRestart && (
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onRestart();
                }}
              >
                Restart with a new brief
              </button>
            )}
            <Link
              href="/faq"
              className="block px-3 py-2 text-left text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              FAQ — static vs production
            </Link>
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
  onRequestChanges,
  onRestart,
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
            <p className="text-[11px] text-zinc-500">
              Static preview + ZIP in beta.{" "}
              <Link href="/faq" className="text-zinc-400 underline-offset-2 hover:underline">
                FAQ
              </Link>
            </p>
            <HudMoreMenu
              runId={runId}
              onRequestChanges={onRequestChanges}
              onRestart={onRestart}
              onCopyLink={() => void handleCopyLink()}
              copyState={copyState}
              showPreviewActions
            />
          </>
        ) : (
          runFinished && (
            <div className="space-y-2">
              <span className="text-[11px] text-zinc-400">No previewable HTML yet</span>
              {(onRequestChanges || onRestart) && (
                <HudMoreMenu
                  runId={runId}
                  onRequestChanges={onRequestChanges}
                  onRestart={onRestart}
                  onCopyLink={() => void handleCopyLink()}
                  copyState={copyState}
                  showPreviewActions={false}
                />
              )}
            </div>
          )
        )}
      </div>
    );
  }

  return (
    <div className={className ?? "flex flex-col gap-1"}>
      <div className="flex flex-wrap items-center gap-1">
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
      {runFinished && (
        <p className="px-1 text-[11px] text-zinc-500">
          Beta: static preview + ZIP —{" "}
          <Link href="/faq" className="underline-offset-2 hover:underline">
            FAQ
          </Link>
        </p>
      )}
    </div>
  );
}
