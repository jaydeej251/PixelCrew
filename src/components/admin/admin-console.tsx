"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel";

type Overview = {
  users: number;
  organizations: number;
  runsToday: number;
  runsMonth: number;
  failedRuns: number;
  stuckRuns: number;
};

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "pro" | "enterprise";
  memberCount: number;
  workspaceCount: number;
  runsThisMonth: number;
};

type RunRow = {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  organizationName: string;
  organizationSlug: string;
  plan: string;
};

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  platformRole: string;
  sessionCount: number;
};

async function readJson<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export function AdminConsole() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      try {
        setError("");
        const [overviewJson, orgsJson, runsJson, usersJson] = await Promise.all([
          readJson<Overview>(await fetch("/api/admin/overview")),
          readJson<{ organizations: OrgRow[] }>(await fetch("/api/admin/organizations")),
          readJson<{ runs: RunRow[] }>(await fetch("/api/admin/runs?status=stuck")),
          readJson<{ users: UserRow[] }>(await fetch("/api/admin/users")),
        ]);
        setOverview(overviewJson);
        setOrgs(orgsJson.organizations);
        setRuns(runsJson.runs);
        setUsers(usersJson.users);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load admin data");
      }
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function setPlan(organizationId: string, plan: OrgRow["plan"]) {
    startTransition(async () => {
      try {
        setError("");
        setMessage("");
        await readJson(
          await fetch(`/api/admin/organizations/${organizationId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plan }),
          }),
        );
        setMessage(`Updated plan to ${plan}`);
        refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update plan");
      }
    });
  }

  function cancelRun(runId: string) {
    if (!window.confirm("Cancel this stuck run?")) return;
    startTransition(async () => {
      try {
        setError("");
        setMessage("");
        await readJson(
          await fetch(`/api/admin/runs/${runId}/cancel`, { method: "POST" }),
        );
        setMessage("Run cancelled");
        refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to cancel run");
      }
    });
  }

  function revokeSessions(userId: string, email: string) {
    if (!window.confirm(`Revoke all sessions for ${email}?`)) return;
    startTransition(async () => {
      try {
        setError("");
        setMessage("");
        const result = await readJson<{ deletedSessions: number }>(
          await fetch(`/api/admin/users/${userId}/revoke-sessions`, { method: "POST" }),
        );
        setMessage(`Revoked ${result.deletedSessions} session(s)`);
        refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to revoke sessions");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">
          Tenant health, plan grants, stuck runs. Credentials are never shown.
        </p>
        <Button type="button" variant="secondary" disabled={pending} onClick={refresh}>
          Refresh
        </Button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {message}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(
          [
            ["Users", overview?.users],
            ["Organizations", overview?.organizations],
            ["Runs today", overview?.runsToday],
            ["Runs this month", overview?.runsMonth],
            ["Failed runs", overview?.failedRuns],
            ["Stuck runs", overview?.stuckRuns],
          ] as const
        ).map(([label, value]) => (
          <Panel key={label}>
            <PanelContent>
              <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {value ?? (pending ? "…" : "—")}
              </p>
            </PanelContent>
          </Panel>
        ))}
      </div>

      <Panel>
        <PanelHeader>
          <PanelTitle>Organizations</PanelTitle>
        </PanelHeader>
        <PanelContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500">
              <tr>
                <th className="pb-2 pr-3 font-medium">Name</th>
                <th className="pb-2 pr-3 font-medium">Plan</th>
                <th className="pb-2 pr-3 font-medium">Members</th>
                <th className="pb-2 pr-3 font-medium">Runs / mo</th>
                <th className="pb-2 font-medium">Grant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {orgs.map((org) => (
                <tr key={org.id}>
                  <td className="py-3 pr-3">
                    <div className="font-medium text-zinc-100">{org.name}</div>
                    <div className="text-xs text-zinc-500">{org.slug}</div>
                  </td>
                  <td className="py-3 pr-3 capitalize text-zinc-300">{org.plan}</td>
                  <td className="py-3 pr-3 tabular-nums text-zinc-300">{org.memberCount}</td>
                  <td className="py-3 pr-3 tabular-nums text-zinc-300">{org.runsThisMonth}</td>
                  <td className="py-3">
                    <select
                      className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
                      value={org.plan}
                      disabled={pending}
                      onChange={(e) =>
                        setPlan(org.id, e.target.value as OrgRow["plan"])
                      }
                    >
                      <option value="free">free</option>
                      <option value="pro">pro</option>
                      <option value="enterprise">enterprise</option>
                    </select>
                  </td>
                </tr>
              ))}
              {orgs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-zinc-500">
                    No organizations
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </PanelContent>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>Stuck runs</PanelTitle>
        </PanelHeader>
        <PanelContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500">
              <tr>
                <th className="pb-2 pr-3 font-medium">Run</th>
                <th className="pb-2 pr-3 font-medium">Org</th>
                <th className="pb-2 pr-3 font-medium">Status</th>
                <th className="pb-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {runs.map((run) => (
                <tr key={run.id}>
                  <td className="py-3 pr-3">
                    <div className="font-medium text-zinc-100">
                      {run.title || "Untitled"}
                    </div>
                    <div className="font-mono text-[11px] text-zinc-600">{run.id}</div>
                  </td>
                  <td className="py-3 pr-3 text-zinc-300">
                    {run.organizationName}
                    <div className="text-xs text-zinc-500">{run.organizationSlug}</div>
                  </td>
                  <td className="py-3 pr-3 capitalize text-zinc-300">{run.status}</td>
                  <td className="py-3">
                    <Button
                      type="button"
                      variant="danger"
                      className="px-2 py-1 text-xs"
                      disabled={pending}
                      onClick={() => cancelRun(run.id)}
                    >
                      Cancel
                    </Button>
                  </td>
                </tr>
              ))}
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-zinc-500">
                    No stuck runs
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </PanelContent>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>Users</PanelTitle>
        </PanelHeader>
        <PanelContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500">
              <tr>
                <th className="pb-2 pr-3 font-medium">User</th>
                <th className="pb-2 pr-3 font-medium">Platform</th>
                <th className="pb-2 pr-3 font-medium">Sessions</th>
                <th className="pb-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="py-3 pr-3">
                    <div className="font-medium text-zinc-100">{user.email}</div>
                    {user.name ? (
                      <div className="text-xs text-zinc-500">{user.name}</div>
                    ) : null}
                  </td>
                  <td className="py-3 pr-3 capitalize text-zinc-300">{user.platformRole}</td>
                  <td className="py-3 pr-3 tabular-nums text-zinc-300">{user.sessionCount}</td>
                  <td className="py-3">
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-2 py-1 text-xs"
                      disabled={pending || user.sessionCount === 0}
                      onClick={() => revokeSessions(user.id, user.email)}
                    >
                      Revoke sessions
                    </Button>
                  </td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-zinc-500">
                    No users
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </PanelContent>
      </Panel>
    </div>
  );
}
