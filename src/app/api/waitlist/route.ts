import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
  await prisma.waitlistEntry.upsert({
    where: { email },
    create: { email },
    update: {},
  });
  return NextResponse.json({ ok: true });
}
