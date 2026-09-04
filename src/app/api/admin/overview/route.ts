import { NextResponse } from "next/server";
import type { RunStatus } from "@prisma/client";
import { adminErrorResponse, dayStart, monthStart, requireAdminSession } from "@/lib/admin-api";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await requireAdminSession();

    const startOfMonth = monthStart();
    const startOfDay = dayStart();
    const stuckStatuses: RunStatus[] = ["pending", "running", "paused"];

    const [users, organizations, runsToday, runsMonth, failedRuns, stuckRuns] =
      await Promise.all([
        prisma.user.count(),
        prisma.organization.count(),
        prisma.run.count({ where: { createdAt: { gte: startOfDay } } }),
        prisma.run.count({ where: { createdAt: { gte: startOfMonth } } }),
        prisma.run.count({ where: { status: "failed" } }),
        prisma.run.count({ where: { status: { in: stuckStatuses } } }),
      ]);

    return NextResponse.json({
      users,
      organizations,
      runsToday,
      runsMonth,
      failedRuns,
      stuckRuns,
    });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
