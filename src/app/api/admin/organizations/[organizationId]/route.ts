import { NextResponse } from "next/server";
import type { PlanTier } from "@prisma/client";
import { AuthError } from "@/lib/auth";
import { adminErrorResponse, requireAdminSession } from "@/lib/admin-api";
import { prisma } from "@/lib/db";
import { writeAdminAuditLog } from "@/lib/platform-admin";

const PLANS = new Set<PlanTier>(["free", "pro", "enterprise"]);

type RouteContext = { params: Promise<{ organizationId: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const session = await requireAdminSession();
    const { organizationId } = await context.params;
    const body = (await req.json().catch(() => null)) as { plan?: string } | null;
    const plan = body?.plan;
    if (!plan || !PLANS.has(plan as PlanTier)) {
      return NextResponse.json(
        { error: "plan must be free, pro, or enterprise" },
        { status: 400 },
      );
    }

    const existing = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, plan: true, slug: true },
    });
    if (!existing) throw new AuthError("Not found");

    const updated = await prisma.organization.update({
      where: { id: organizationId },
      data: { plan: plan as PlanTier },
      select: { id: true, name: true, slug: true, plan: true },
    });

    await writeAdminAuditLog({
      actorId: session.id,
      action: "organization.set_plan",
      targetType: "organization",
      targetId: organizationId,
      meta: { from: existing.plan, to: plan, slug: existing.slug },
    });

    return NextResponse.json({ organization: updated });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
