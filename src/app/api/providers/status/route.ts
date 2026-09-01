import { NextResponse } from "next/server";
import type { ProviderType } from "@prisma/client";
import {
  RUN_PROVIDERS,
  workspaceHasProvider,
  getDefaultModel,
} from "@/lib/run-setup";

export async function GET(req: Request) {
  const workspaceId = new URL(req.url).searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }

  const statuses = await Promise.all(
    RUN_PROVIDERS.map(async (p) => {
      const check = await workspaceHasProvider(workspaceId, p.id);
      return {
        provider: p.id,
        label: p.label,
        ready: check.ready,
        source: check.source,
        defaultModel: getDefaultModel(p.id),
      };
    }),
  );

  return NextResponse.json({ providers: statuses });
}
