import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveApiKey } from "@/lib/run-setup";
import type { ProviderType } from "@prisma/client";

export async function POST(req: Request) {
  const { workspaceId, provider } = await req.json();
  if (!workspaceId || !provider) {
    return NextResponse.json({ error: "workspaceId and provider required" }, { status: 400 });
  }

  const providerType = provider as ProviderType;
  const cred = await prisma.providerCredential.findFirst({
    where: { workspaceId, provider: providerType },
  });
  const resolved = resolveApiKey(providerType, cred);

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
}
