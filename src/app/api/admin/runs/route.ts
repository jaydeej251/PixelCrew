import { NextResponse } from "next/server";
import type { RunStatus } from "@prisma/client";
import { adminErrorResponse, requireAdminSession } from "@/lib/admin-api";
import { prisma } from "@/lib/db";

const ALL_STATUSES = new Set<RunStatus>([
  "pending",
  "running",
  "paused",
  "completed",
  "cancelled",
  "failed",
]);

export async function GET(req: Request) {
  try {
    await requireAdminSession();
    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status");
    const take = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 100);

    const where =
      statusParam && ALL_STATUSES.has(statusParam as RunStatus)
        ? { status: statusParam as RunStatus }
        : statusParam === "stuck"
          ? { status: { in: ["pending", "running", "paused"] as RunStatus[] } }
          : {};

    const runs = await prisma.run.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        workspaceId: true,
        workspace: {
          select: {
            name: true,
            organizationId: true,
            organization: { select: { name: true, slug: true, plan: true } },
          },
        },
      },
    });

    return NextResponse.json({
      runs: runs.map((run) => ({
        id: run.id,
        title: run.title,
        status: run.status,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        workspaceId: run.workspaceId,
        workspaceName: run.workspace.name,
        organizationId: run.workspace.organizationId,
        organizationName: run.workspace.organization.name,
        organizationSlug: run.workspace.organization.slug,
        plan: run.workspace.organization.plan,
      })),
    });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
