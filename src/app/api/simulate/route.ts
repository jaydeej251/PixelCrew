import { NextResponse } from "next/server";
import { SIMULATED_EVENTS } from "@/lib/office";

export async function POST() {
  return NextResponse.json({ events: SIMULATED_EVENTS });
}
