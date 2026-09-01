"use client";

import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import { formatUsd } from "@/lib/utils";

type Artifact = {
  id: string;
  type: string;
  title: string;
  content: string;
  createdAt: string;
};

type ArtifactsPanelProps = {
  artifacts: Artifact[];
  totalTokens?: number;
  estCostUsd?: number;
  runId?: string;
};

export function ArtifactsPanel({
  artifacts,
  totalTokens = 0,
  estCostUsd = 0,
  runId,
}: ArtifactsPanelProps) {
  return (
    <Panel>
      <PanelHeader className="flex items-center justify-between">
        <PanelTitle className="flex items-center gap-2">
          <FileText size={14} />
          Artifacts ({artifacts.length})
        </PanelTitle>
        {runId && artifacts.length > 0 && (
          <a href={`/api/runs/${runId}/export`} download>
            <Button variant="ghost" className="!px-2 !py-1">
              <Download size={14} />
              Export zip
            </Button>
          </a>
        )}
      </PanelHeader>
      <PanelContent>
        <div className="mb-3 flex gap-4 text-xs text-zinc-500">
          <span>{totalTokens.toLocaleString()} tokens</span>
          <span>{formatUsd(estCostUsd)} est.</span>
        </div>
        <ul className="max-h-64 space-y-2 overflow-auto">
          {artifacts.map((a) => (
            <li key={a.id} className="rounded-lg border border-zinc-800 p-2">
              <p className="text-xs font-medium text-indigo-400">{a.type}</p>
              <p className="text-sm text-zinc-200">{a.title}</p>
              <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{a.content}</p>
            </li>
          ))}
          {artifacts.length === 0 && (
            <li className="text-xs text-zinc-600">Run a team to generate artifacts</li>
          )}
        </ul>
      </PanelContent>
    </Panel>
  );
}
