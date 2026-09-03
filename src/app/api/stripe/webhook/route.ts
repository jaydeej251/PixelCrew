import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Billing webhooks are not enabled" },
    { status: 503 },
  );
}
