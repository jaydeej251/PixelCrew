import { NextResponse } from "next/server";
import { ProviderType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import {
  AuthError,
  assertWorkspaceAccess,
  authErrorStatus,
  requireOrganizationRole,
  requireProductSession,
} from "@/lib/auth";
import { isOllamaCloudBaseUrl } from "@/lib/ollama-endpoints";
import { looksLikeIncompleteOllamaApiKey } from "@/lib/ollama-models";
import { setDefaultProviderCredential } from "@/lib/provider-credentials";

const credentialSchema = z
  .object({
    workspaceId: z.string().min(1),
    provider: z.nativeEnum(ProviderType),
    label: z.string().trim().min(1).max(100),
    apiKey: z.string().trim().max(10_000).optional(),
    baseUrl: z.url().max(2_000).optional(),
  })
  .strict();

const setDefaultSchema = z
  .object({
    action: z.literal("set_default"),
    id: z.string().min(1),
  })
  .strict();

function authErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: authErrorStatus(err) });
  }
  throw err;
}

export async function POST(req: Request) {
  try {
    const session = await requireProductSession();
    requireOrganizationRole(session, ["owner", "admin"]);
    const parsed = credentialSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid credential settings" }, { status: 400 });
    }
    const { workspaceId, provider, label, apiKey, baseUrl } = parsed.data;
    await assertWorkspaceAccess(workspaceId, session);

    const trimmedKey = apiKey?.trim();
    if (provider !== "ollama" && !trimmedKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 });
    }
    if (provider === "ollama" && isOllamaCloudBaseUrl(baseUrl) && !trimmedKey) {
      return NextResponse.json(
        { error: "API key is required for Ollama Cloud (ollama.com)" },
        { status: 400 },
      );
    }
    if (
      provider === "ollama" &&
      isOllamaCloudBaseUrl(baseUrl) &&
      trimmedKey &&
      looksLikeIncompleteOllamaApiKey(trimmedKey)
    ) {
      return NextResponse.json(
        {
          error:
            "That Ollama Cloud key looks incomplete. Paste the full id.secret value from ollama.com/settings/keys — a truncated key can list models but chat returns Unauthorized.",
        },
        { status: 400 },
      );
    }

    const cred = await prisma.$transaction(async (tx) => {
      await tx.providerCredential.updateMany({
        where: { workspaceId, provider },
        data: { isDefault: false },
      });
      return tx.providerCredential.create({
        data: {
          workspaceId,
          provider,
          label,
          encryptedKey: trimmedKey ? encrypt(trimmedKey) : null,
          baseUrl: baseUrl?.trim() ?? null,
          isDefault: true,
        },
      });
    });

    return NextResponse.json({
      id: cred.id,
      provider: cred.provider,
      label: cred.label,
      baseUrl: cred.baseUrl,
      isDefault: cred.isDefault,
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireProductSession();
    requireOrganizationRole(session, ["owner", "admin"]);
    const parsed = setDefaultSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid credential action" }, { status: 400 });
    }

    const existing = await prisma.providerCredential.findUnique({
      where: { id: parsed.data.id },
      select: { id: true, workspaceId: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await assertWorkspaceAccess(existing.workspaceId, session);

    const cred = await setDefaultProviderCredential(prisma, existing.id);
    return NextResponse.json({
      id: cred.id,
      provider: cred.provider,
      label: cred.label,
      baseUrl: cred.baseUrl,
      isDefault: cred.isDefault,
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function GET(req: Request) {
  try {
    const session = await requireProductSession();
    const workspaceId = new URL(req.url).searchParams.get("workspaceId");
    if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    await assertWorkspaceAccess(workspaceId, session);

    const creds = await prisma.providerCredential.findMany({
      where: { workspaceId },
      select: {
        id: true,
        provider: true,
        label: true,
        baseUrl: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    });
    return NextResponse.json(creds);
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireProductSession();
    requireOrganizationRole(session, ["owner", "admin"]);
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
