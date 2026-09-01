import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import type { ProviderType } from "@prisma/client";

export async function POST(req: Request) {
  const body = await req.json();
  const { workspaceId, provider, label, apiKey, baseUrl } = body;

  const cred = await prisma.providerCredential.create({
    data: {
      workspaceId,
      provider: provider as ProviderType,
      label: label ?? provider,
      encryptedKey: apiKey ? encrypt(apiKey) : null,
      baseUrl: baseUrl ?? null,
    },
  });

  return NextResponse.json({ id: cred.id, provider: cred.provider, label: cred.label });
}

export async function GET(req: Request) {
  const workspaceId = new URL(req.url).searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });

  const creds = await prisma.providerCredential.findMany({
    where: { workspaceId },
    select: { id: true, provider: true, label: true, baseUrl: true, createdAt: true },
  });
  return NextResponse.json(creds);
}
