import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import {
  AuthError,
  assertWorkspaceAccess,
  requireSession,
} from "@/lib/auth";
import type { ProviderType } from "@prisma/client";

function authErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.message === "Unauthorized" ? 401 : 404 });
  }
  throw err;
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const { workspaceId, provider, label, apiKey, baseUrl } = body;
    await assertWorkspaceAccess(workspaceId, session);

    const trimmedKey = apiKey?.trim();
    if (provider !== "ollama" && !trimmedKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 });
    }

    const cred = await prisma.providerCredential.create({
      data: {
        workspaceId,
        provider: provider as ProviderType,
        label: label ?? provider,
        encryptedKey: trimmedKey ? encrypt(trimmedKey) : null,
        baseUrl: baseUrl?.trim() ?? null,
      },
    });

    return NextResponse.json({ id: cred.id, provider: cred.provider, label: cred.label });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function GET(req: Request) {
  try {
    const session = await requireSession();
    const workspaceId = new URL(req.url).searchParams.get("workspaceId");
    if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    await assertWorkspaceAccess(workspaceId, session);

    const creds = await prisma.providerCredential.findMany({
      where: { workspaceId },
      select: { id: true, provider: true, label: true, baseUrl: true, createdAt: true },
    });
    return NextResponse.json(creds);
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireSession();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const cred = await prisma.providerCredential.findUnique({
      where: { id },
      include: { workspace: true },
    });
    if (!cred) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await assertWorkspaceAccess(cred.workspaceId, session);
    await prisma.providerCredential.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}
