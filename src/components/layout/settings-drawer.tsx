"use client";

import { useState } from "react";
import { Drawer } from "@/components/ui/drawer";
import { OrgBuilder } from "@/components/org/org-builder";
import { CredentialsForm } from "@/components/settings/credentials-form";
import { RunSettings } from "@/components/settings/run-settings";
import { TEAM_TEMPLATES } from "@/lib/templates";
import type { OfficeAgent } from "@/lib/office";

type SettingsDrawerProps = {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  agents: OfficeAgent[];
  runProvider: string;
  runModel: string;
  onProviderChange: (v: string) => void;
  onModelChange: (v: string) => void;
  onRefresh: () => Promise<void>;
  onAgentRemoved?: (id: string) => void;
};

export function SettingsDrawer({
  open,
  onClose,
  workspaceId,
  agents,
  runProvider,
  runModel,
  onProviderChange,
  onModelChange,
  onRefresh,
  onAgentRemoved,
}: SettingsDrawerProps) {
  const [credentialsRevision, setCredentialsRevision] = useState(0);

  return (
    <Drawer open={open} onClose={onClose} title="Settings">
      <div className="space-y-6">
        <OrgBuilder
          agents={agents}
          templates={TEAM_TEMPLATES}
          onApplyTemplate={async (templateId) => {
            await fetch(`/api/workspace/${workspaceId}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "apply_template", templateId }),
            });
            await onRefresh();
          }}
          onHire={async (hireData) => {
            await fetch(`/api/workspace/${workspaceId}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "hire", ...hireData }),
            });
            await onRefresh();
          }}
          onUpdate={async (id, hireData) => {
            await fetch(`/api/agents/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(hireData),
            });
            await onRefresh();
          }}
          onRemove={async (id) => {
            await fetch(`/api/agents/${id}`, { method: "DELETE" });
            onAgentRemoved?.(id);
            await onRefresh();
          }}
        />
        <CredentialsForm
          workspaceId={workspaceId}
          onCredentialsChange={() => setCredentialsRevision((n) => n + 1)}
          onSave={async (cred) => {
            const response = await fetch("/api/credentials", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ workspaceId, ...cred }),
            });
            if (!response.ok) {
              const body = (await response.json().catch(() => null)) as {
                error?: string;
              } | null;
              throw new Error(body?.error || "Failed to save credential");
            }
          }}
        />
        <RunSettings
          workspaceId={workspaceId}
          provider={runProvider}
          model={runModel}
          onProviderChange={onProviderChange}
          onModelChange={onModelChange}
          credentialsRevision={credentialsRevision}
        />
      </div>
    </Drawer>
  );
}
