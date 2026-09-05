import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { findProviderCredential } from "@/lib/provider-credentials";
import { getDefaultModel } from "@/lib/run-setup";
import { resolveProviderConfig } from "@/lib/providers";
import {
  canListOllamaModelsFromBaseUrl,
  fetchOllamaInstalledModels,
} from "@/lib/ollama-list-models";
import { getOllamaEndpointMode } from "@/lib/ollama-models";
import {
  AuthError,
  assertWorkspaceAccess,
  authErrorStatus,
  requireProductSession,
} from "@/lib/auth";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * GET /api/providers/ollama/models?workspaceId=…
 * Lists models installed on the machine running the Next.js server (local Ollama).
 */
export async function GET(req: Request) {
  try {
    const session = await requireProductSession();
    const workspaceId = new URL(req.url).searchParams.get("workspaceId");
    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    }
    await assertWorkspaceAccess(workspaceId, session);

    const limit = await consumeRateLimit({
      scope: "ollama-models-organization",
      identifier: session.organizationId,
      limit: 30,
      windowMs: 60_000,
    });
    if (!limit.allowed) return rateLimitResponse(limit);

    const cred = await findProviderCredential(prisma, workspaceId, "ollama");
    const config = resolveProviderConfig(
      "ollama",
      getDefaultModel("ollama"),
      cred ?? undefined,
    );
    const mode = getOllamaEndpointMode(config.baseUrl);

    if (!canListOllamaModelsFromBaseUrl(config.baseUrl)) {
      return NextResponse.json(
        {
          ok: false,
          mode,
          baseUrl: config.baseUrl ?? null,
          models: [],
          message:
            mode === "cloud"
              ? "You’re on Ollama Cloud right now. Click Use local under Your API keys if you want models from the Ollama app on this computer."
              : "Local models only work when PixelCrew and the Ollama app are on the same computer.",
        },
        { status: 400 },
      );
    }

    try {
      const listed = await fetchOllamaInstalledModels({
        baseUrl: config.baseUrl!,
        apiKey: config.apiKey,
      });
      return NextResponse.json({
        ok: true,
        mode,
        baseUrl: config.baseUrl,
        models: listed.models,
        source: listed.source,
        message:
          listed.models.length > 0
            ? `Found ${listed.models.length} model${listed.models.length === 1 ? "" : "s"} on this computer.`
            : "Ollama is running, but no models are downloaded yet.",
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "We couldn’t load your local models right now.";
      return NextResponse.json({
        ok: false,
        mode,
        baseUrl: config.baseUrl,
        models: [],
        message,
      });
    }
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: authErrorStatus(err) });
    }
    throw err;
  }
}
