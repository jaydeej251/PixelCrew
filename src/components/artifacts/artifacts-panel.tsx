"use client";

import { useState } from "react";
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
  runFinished?: boolean;
};

export function ArtifactsPanel({
  artifacts,
  totalTokens = 0,
  estCostUsd = 0,
  runId,
  runFinished = false,
}: ArtifactsPanelProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = artifacts.find((a) => a.id === openId) ?? null;

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
        <p className="mb-2 text-[11px] leading-relaxed text-zinc-500">
          Drafts from this run (plan, architecture, code sketches, QA). Not a running app — nothing
          is deployed. Export zip if you want the markdown files.
        </p>
        <div className="mb-3 flex gap-4 text-xs text-zinc-500">
          <span>{totalTokens.toLocaleString()} tokens</span>
          <span>{formatUsd(estCostUsd)} est.</span>
        </div>
        <ul className="max-h-64 space-y-2 overflow-auto">
          {artifacts.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setOpenId(openId === a.id ? null : a.id)}
                className="w-full rounded-lg border border-zinc-800 p-2 text-left hover:border-indigo-500/40"
              >
                <p className="text-xs font-medium text-indigo-400">{a.type}</p>
                <p className="text-sm text-zinc-200">{a.title}</p>
                <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{a.content}</p>
              </button>
            </li>
          ))}
          {artifacts.length === 0 && (
            <li className="text-xs text-zinc-600">
              {runFinished
                ? "This run finished but stored no drafts. Check the timeline for errors."
                : "Run a team to generate artifacts"}
            </li>
          )}
        </ul>
        {open && (
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-900 p-3 text-xs text-zinc-300">
            {open.content}
          </pre>
        )}
      </PanelContent>
    </Panel>
  );
}
