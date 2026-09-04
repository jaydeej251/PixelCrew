import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { adminErrorResponse, requireAdminSession } from "@/lib/admin-api";
import { prisma } from "@/lib/db";
import { writeAdminAuditLog } from "@/lib/platform-admin";

type RouteContext = { params: Promise<{ userId: string }> };

export async function POST(_req: Request, context: RouteContext) {
  try {
    const session = await requireAdminSession();
    const { userId } = await context.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) throw new AuthError("Not found");

    const result = await prisma.session.deleteMany({ where: { userId } });

    await writeAdminAuditLog({
      actorId: session.id,
      action: "user.revoke_sessions",
      targetType: "user",
      targetId: userId,
      meta: { email: user.email, deletedSessions: result.count },
    });

    return NextResponse.json({ ok: true, deletedSessions: result.count });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
