import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { findProviderCredential } from "@/lib/provider-credentials";
import { getDefaultModel, resolveApiKey } from "@/lib/run-setup";
import { resolveProviderConfig } from "@/lib/providers";
import { isOllamaCloudBaseUrl, ollamaNativeChatUrl } from "@/lib/ollama-endpoints";
import {
  getOllamaDefaultModelForMode,
  looksLikeIncompleteOllamaApiKey,
} from "@/lib/ollama-models";
import { extractErrorText } from "@/lib/providers/http-errors";
import { assertWorkspaceAccess, requireProductSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api-error";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const session = await requireProductSession();
    const { workspaceId, provider } = await req.json();
    if (
      typeof workspaceId !== "string" ||
      (provider !== "openrouter" &&
        provider !== "ollama" &&
        provider !== "anthropic")
    ) {
      return NextResponse.json(
        {
          error:
            "A valid workspaceId and openrouter, anthropic, or ollama provider are required",
        },
        { status: 400 },
      );
    }
    await assertWorkspaceAccess(workspaceId, session);
    const limit = await consumeRateLimit({
      scope: "provider-test-organization",
      identifier: session.organizationId,
      limit: 10,
      windowMs: 10 * 60_000,
    });
    if (!limit.allowed) return rateLimitResponse(limit);

    if (provider === "ollama") {
      return NextResponse.json(await testOllamaCloud(workspaceId));
    }

    if (provider === "anthropic") {
      return NextResponse.json(await testAnthropic(workspaceId));
    }

    const cred = await findProviderCredential(prisma, workspaceId, "openrouter");
    const resolved = resolveApiKey("openrouter", cred);

    if (!resolved.key) {
      return NextResponse.json({
        ok: false,
        source: resolved.source,
        message:
          "No valid key found. OpenRouter keys must start with sk-or-v1-. Add OPENROUTER_API_KEY to .env.local and restart npm run dev, or re-save in the sidebar.",
      });
    }

    if (!resolved.key.startsWith("sk-or-v1-")) {
      return NextResponse.json({
        ok: false,
        source: resolved.source,
        message: `Key from ${resolved.source} looks wrong — it should start with sk-or-v1- (yours starts with "${resolved.key.slice(0, 8)}…"). Delete the saved key in the sidebar and use .env.local instead.`,
      });
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolved.key}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "X-Title": "PixelCrew",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "Say OK" }],
        max_tokens: 5,
      }),
    });

    const text = await res.text();
    return NextResponse.json({
      ok: res.ok,
      source: resolved.source,
      status: res.status,
      message: res.ok ? "OpenRouter key works" : text.slice(0, 200),
    });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}

async function testAnthropic(workspaceId: string) {
  const cred = await findProviderCredential(prisma, workspaceId, "anthropic");
  const resolved = resolveApiKey("anthropic", cred);

  if (!resolved.key) {
    return {
      ok: false,
      source: resolved.source,
      message:
        "No valid Anthropic key found. Keys must start with sk-ant-. Save one under Anthropic in Settings, or set ANTHROPIC_API_KEY in .env.local (dev only).",
    };
  }

  if (!resolved.key.startsWith("sk-ant-")) {
    return {
      ok: false,
      source: resolved.source,
      message: `Key from ${resolved.source} looks wrong — it should start with sk-ant- (yours starts with "${resolved.key.slice(0, 8)}…"). Re-save under Anthropic in Settings.`,
    };
  }

  const model = getDefaultModel("anthropic");
  const res = await fetch("https://api.anthropic.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resolved.key}`,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Say OK" }],
      max_tokens: 5,
    }),
  });

  const text = await res.text();
  return {
    ok: res.ok,
    source: resolved.source,
    status: res.status,
    message: res.ok
      ? "Anthropic key works"
      : extractErrorText(text) || text.slice(0, 200) || `HTTP ${res.status}`,
  };
}

async function testOllamaCloud(workspaceId: string) {
  const cred = await findProviderCredential(prisma, workspaceId, "ollama");
  const resolved = resolveApiKey("ollama", cred);
  const config = resolveProviderConfig("ollama", getDefaultModel("ollama"), cred ?? undefined);

  if (!isOllamaCloudBaseUrl(config.baseUrl)) {
    return {
      ok: false,
      source: resolved.source,
      message:
        "Active Ollama endpoint is local. Click Use on your cloud key first, then test again.",
    };
  }

  if (!resolved.key) {
    return {
      ok: false,
      source: resolved.source,
      message:
        "No Ollama Cloud API key found. Create one at ollama.com/settings/keys and save it as the cloud credential.",
    };
  }

  const key = resolved.key;
  const keyMeta = {
    length: key.length,
    prefix: key.slice(0, 4),
    hasWhitespace: /\s/.test(key),
  };

  const authHeaders = {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };

  const chatModel = getOllamaDefaultModelForMode("cloud");
  const nativeChatUrl = ollamaNativeChatUrl(config.baseUrl ?? "https://ollama.com/v1");
  const openaiChatUrl = `${(config.baseUrl ?? "https://ollama.com/v1").replace(/\/+$/, "")}/chat/completions`;
  const modelsUrl = `${(config.baseUrl ?? "https://ollama.com/v1").replace(/\/+$/, "")}/models`;
  const tagsUrl = "https://ollama.com/api/tags";

  const [modelsRes, tagsRes, nativeChatRes, openaiChatRes] = await Promise.all([
    fetch(modelsUrl, { headers: authHeaders }),
    fetch(tagsUrl, { headers: authHeaders }),
    fetch(nativeChatUrl, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: chatModel,
        messages: [{ role: "user", content: "Reply with OK" }],
        stream: false,
      }),
    }),
    fetch(openaiChatUrl, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: chatModel,
        messages: [{ role: "user", content: "Reply with OK" }],
        max_tokens: 8,
        stream: false,
      }),
    }),
  ]);

  const probes = {
    models: summarizeProbe(modelsRes.status, await modelsRes.text()),
    tags: summarizeProbe(tagsRes.status, await tagsRes.text()),
    nativeChat: summarizeProbe(nativeChatRes.status, await nativeChatRes.text()),
    openaiChat: summarizeProbe(openaiChatRes.status, await openaiChatRes.text()),
  };

  if (probes.nativeChat.ok) {
    return {
      ok: true,
      source: resolved.source,
      status: probes.nativeChat.status,
      keyMeta,
      probes,
      message: `Ollama Cloud chat works on ${nativeChatUrl} (model ${chatModel})`,
    };
  }

  if (probes.openaiChat.ok && !probes.nativeChat.ok) {
    return {
      ok: false,
      source: resolved.source,
      status: probes.nativeChat.status,
      keyMeta,
      probes,
      message:
        `OpenAI /v1/chat/completions works, but PixelCrew runs use native ${nativeChatUrl} ` +
        `which returned HTTP ${probes.nativeChat.status} (${probes.nativeChat.body || "—"}). ` +
        `Treat this as a failed test until /api/chat succeeds.`,
    };
  }

  const listOk = probes.models.ok || probes.tags.ok;
  const chatUnauthorized =
    probes.nativeChat.status === 401 ||
    /unauthorized/i.test(probes.nativeChat.body);

  if (listOk && chatUnauthorized) {
    const incompleteHint = looksLikeIncompleteOllamaApiKey(key)
      ? " This key looks incomplete (Ollama keys usually look like id.secret — copy the full value once)."
      : "";
    return {
      ok: false,
      source: resolved.source,
      status: probes.nativeChat.status,
      keyMeta,
      probes,
      message:
        `Listing models is not enough — chat at ${nativeChatUrl} returned HTTP ${probes.nativeChat.status} (${probes.nativeChat.body || "—"}). ` +
        `/api/tags can succeed without a usable chat key.` +
        incompleteHint +
        ` Key looks like ${keyMeta.prefix}… (${keyMeta.length} chars` +
        `${keyMeta.hasWhitespace ? ", contains whitespace — re-paste carefully" : ""}). ` +
        `Create a fresh key at ollama.com/settings/keys and paste the entire secret.`,
    };
  }

  if (
    probes.nativeChat.status === 404 ||
    probes.openaiChat.status === 404 ||
    /not found|unknown model|subscription|upgrade|credits|payment/i.test(
      `${probes.nativeChat.body} ${probes.openaiChat.body}`,
    )
  ) {
    return {
      ok: false,
      source: resolved.source,
      status: probes.nativeChat.status || probes.openaiChat.status,
      keyMeta,
      probes,
      message:
        `Key reached Ollama, but model “${chatModel}” failed ` +
        `(native: ${probes.nativeChat.body || probes.nativeChat.status}; ` +
        `openai: ${probes.openaiChat.body || probes.openaiChat.status}). ` +
        `Try a free-tier cloud model from ollama.com/search?c=cloud.`,
    };
  }

  return {
    ok: false,
    source: resolved.source,
    status: probes.nativeChat.status,
    keyMeta,
    probes,
    message:
      `Ollama Cloud chat failed. native /api/chat HTTP ${probes.nativeChat.status}: ${probes.nativeChat.body}; ` +
      `/v1/chat/completions HTTP ${probes.openaiChat.status}: ${probes.openaiChat.body}; ` +
      `/v1/models HTTP ${probes.models.status}; /api/tags HTTP ${probes.tags.status}.`,
  };
}

function summarizeProbe(status: number, body: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: extractErrorText(body) || (status >= 200 && status < 300 ? "ok" : ""),
  };
}
