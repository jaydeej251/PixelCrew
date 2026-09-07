"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button, buttonClassName } from "@/components/ui/button";
import { OrgBuilder } from "@/components/org/org-builder";
import { CredentialsForm } from "@/components/settings/credentials-form";
import { RunSettings } from "@/components/settings/run-settings";
import { TEAM_TEMPLATES } from "@/lib/templates";
import { getOllamaEndpointMode } from "@/lib/ollama-models";
import { allowsPerAgentBrains } from "@/lib/agent-brains";
import type { ProviderType } from "@prisma/client";
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
  onCredentialsChange?: () => void;
  onProviderTestResult?: (ok: boolean) => void;
  onLogout?: () => void;
};

type ProviderStatusRow = {
  provider: string;
  activeBaseUrl?: string | null;
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
  onCredentialsChange,
  onProviderTestResult,
  onLogout,
}: SettingsDrawerProps) {
  const [credentialsRevision, setCredentialsRevision] = useState(0);
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState<string | null>(null);

  const bumpCredentials = () => {
    setCredentialsRevision((n) => n + 1);
    onCredentialsChange?.();
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/providers/status?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then(async (r) => {
        const d = (await r.json().catch(() => null)) as {
          providers?: ProviderStatusRow[];
        } | null;
        if (cancelled || !r.ok) return;
        const ollama = d?.providers?.find((p) => p.provider === "ollama");
        setOllamaBaseUrl(ollama?.activeBaseUrl ?? null);
      })
      .catch(() => {
        if (!cancelled) setOllamaBaseUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, credentialsRevision]);

  const ollamaMode = getOllamaEndpointMode(ollamaBaseUrl);
  const sharedBrainOnly = !allowsPerAgentBrains(
    runProvider as ProviderType,
    ollamaMode,
  );

  return (
    <Drawer open={open} onClose={onClose} title="Settings">
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          <Link href="/account" onClick={onClose} className={buttonClassName("secondary", "!h-8 !text-xs")}>
            Account
          </Link>
          <Link href="/support" onClick={onClose} className={buttonClassName("ghost", "!h-8 !text-xs")}>
            Support
          </Link>
          {onLogout && (
            <Button
              type="button"
              variant="ghost"
              className="!h-8 !text-xs text-red-300"
              onClick={() => {
                onClose();
                onLogout();
              }}
            >
              <LogOut size={14} />
              Log out
            </Button>
          )}
        </div>
        <OrgBuilder
          agents={agents}
          templates={TEAM_TEMPLATES}
          defaultProvider={runProvider}
          defaultModel={runModel}
          workspaceId={workspaceId}
          credentialsRevision={credentialsRevision}
          sharedBrainOnly={sharedBrainOnly}
          onApplyTemplate={async (templateId) => {
            const response = await fetch(`/api/workspace/${workspaceId}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "apply_template", templateId }),
            });
            const body = (await response.json().catch(() => null)) as {
              error?: string;
            } | null;
            if (!response.ok) {
              throw new Error(body?.error || "Couldn’t apply that team template.");
            }
            await onRefresh();
          }}
          onHire={async (hireData) => {
            const response = await fetch(`/api/workspace/${workspaceId}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "hire", ...hireData }),
            });
            const body = (await response.json().catch(() => null)) as {
              error?: string;
            } | null;
            if (!response.ok) {
              throw new Error(body?.error || "Couldn’t add that teammate.");
            }
            await onRefresh();
          }}
          onUpdate={async (id, hireData) => {
            const response = await fetch(`/api/agents/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(hireData),
            });
            const body = (await response.json().catch(() => null)) as {
              error?: string;
            } | null;
            if (!response.ok) {
              throw new Error(body?.error || "Couldn’t save teammate changes.");
            }
            await onRefresh();
          }}
          onRemove={async (id) => {
            const response = await fetch(`/api/agents/${id}`, { method: "DELETE" });
            const body = (await response.json().catch(() => null)) as {
              error?: string;
            } | null;
            if (!response.ok) {
              throw new Error(body?.error || "Couldn’t remove that teammate.");
            }
            onAgentRemoved?.(id);
            await onRefresh();
          }}
        />
        <CredentialsForm
          workspaceId={workspaceId}
          onCredentialsChange={bumpCredentials}
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
          onTeamBrainChange={async (provider, model) => {
            onProviderChange(provider);
            onModelChange(model);
            const response = await fetch(`/api/workspace/${workspaceId}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "apply_team_brain",
                provider,
                model,
              }),
            });
            const body = (await response.json().catch(() => null)) as {
              error?: string;
            } | null;
            if (!response.ok) {
              throw new Error(body?.error || "Couldn’t update every teammate’s brain.");
            }
            await onRefresh();
          }}
          credentialsRevision={credentialsRevision}
          onProviderTestResult={onProviderTestResult}
          sharedBrainOnly={sharedBrainOnly}
        />
      </div>
    </Drawer>
  );
}
