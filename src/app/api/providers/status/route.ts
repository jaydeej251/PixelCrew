import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  RUN_PROVIDERS,
  workspaceHasProvider,
  getDefaultModel,
} from "@/lib/run-setup";
import { findProviderCredential } from "@/lib/provider-credentials";
import { resolveProviderConfig } from "@/lib/providers";
import { assertWorkspaceAccess, requireProductSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api-error";


export async function GET(req: Request) {
  try {
    const session = await requireProductSession();
    const workspaceId = new URL(req.url).searchParams.get("workspaceId");
    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    }
    await assertWorkspaceAccess(workspaceId, session);

    const statuses = await Promise.all(
      RUN_PROVIDERS.map(async (p) => {
        const check = await workspaceHasProvider(workspaceId, p.id);
        const cred = await findProviderCredential(prisma, workspaceId, p.id);
        const resolved = resolveProviderConfig(p.id, getDefaultModel(p.id), cred ?? undefined);
        return {
          provider: p.id,
          label: p.label,
          ready: check.ready,
          source: check.source,
          defaultModel: getDefaultModel(p.id),
          activeCredentialId: cred?.id ?? null,
          activeCredentialLabel: cred?.label ?? null,
          activeBaseUrl: resolved.baseUrl ?? null,
          isDefaultCredential: cred?.isDefault ?? false,
        };
      }),
    );

    return NextResponse.json({ providers: statuses });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
