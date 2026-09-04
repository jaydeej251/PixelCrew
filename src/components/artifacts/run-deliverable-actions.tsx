"use client";

import { useState } from "react";
import { Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PreviewModal } from "@/components/artifacts/preview-modal";
import { hasPreviewableApp, type ArtifactLike } from "@/lib/project-files";

type RunDeliverableActionsProps = {
  runId: string;
  artifacts: ArtifactLike[];
  ceoGoal?: string;
  runFinished?: boolean;
  /** Compact row for office HUD; default matches Files panel chrome. */
  variant?: "hud" | "panel";
  className?: string;
};

export function RunDeliverableActions({
  runId,
  artifacts,
  ceoGoal = "",
  runFinished = false,
  variant = "panel",
  className,
}: RunDeliverableActionsProps) {
  const [preview, setPreview] = useState(false);
  const previewReady = hasPreviewableApp(artifacts, ceoGoal);
  const hud = variant === "hud";

  return (
    <>
      <div className={className ?? (hud ? "mt-2 flex flex-wrap gap-2" : "flex items-center gap-1")}>
        {previewReady ? (
          <Button
            type="button"
            variant={hud ? "primary" : "ghost"}
            className={hud ? "!h-8 !px-3" : "!h-8 !px-2"}
            onClick={() => setPreview(true)}
          >
            <Eye size={14} />
            Preview
          </Button>
        ) : (
          runFinished &&
          hud && <span className="text-[11px] text-zinc-400">No previewable HTML yet</span>
        )}
        {!previewReady && runFinished && !hud && (
          <span className="px-1 text-[11px] text-zinc-500">No previewable HTML yet</span>
        )}
        <a href={`/api/runs/${runId}/export`} download>
          <Button
            type="button"
            variant={hud ? "secondary" : "ghost"}
            className={hud ? "!h-8 !px-3" : "!h-8 !px-2"}
          >
            <Download size={14} />
            Download
          </Button>
        </a>
      </div>
      {preview && <PreviewModal runId={runId} onClose={() => setPreview(false)} />}
    </>
  );
}
