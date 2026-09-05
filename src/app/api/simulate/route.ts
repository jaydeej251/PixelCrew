import { NextResponse } from "next/server";
import { AuthError, authErrorStatus, requireProductSession } from "@/lib/auth";
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
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: authErrorStatus(err) });
    }
    throw err;
  }
}
