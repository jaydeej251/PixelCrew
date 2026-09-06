import { NextResponse } from "next/server";
import { requireProductSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api-error";
import { SHOW_DEV_TOOLS } from "@/lib/dev-tools";
import { SIMULATED_EVENTS } from "@/lib/office";

export async function POST() {
  try {
    await requireProductSession();
    if (!SHOW_DEV_TOOLS) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ events: SIMULATED_EVENTS });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
