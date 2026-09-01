import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.text();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ received: true, mode: "stub" });
  }
  // Stripe webhook verification would go here in production
  console.log("Stripe webhook received", body.slice(0, 100));
  return NextResponse.json({ received: true });
}
