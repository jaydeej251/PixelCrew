import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { deleteSession, requireSession, SESSION_COOKIE } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api-error";

/**
 * Delete the signed-in user and any organizations where they are the sole member.
 * Other shared orgs keep their memberships removed via User cascade.
 */
export async function POST() {
  try {
    const session = await requireSession();
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;

    await prisma.$transaction(async (tx) => {
      const memberships = await tx.membership.findMany({
        where: { userId: session.id },
        select: {
          organizationId: true,
          organization: {
            select: {
              id: true,
              _count: { select: { memberships: true } },
            },
          },
        },
      });

      for (const membership of memberships) {
        if (membership.organization._count.memberships <= 1) {
          await tx.organization.delete({ where: { id: membership.organizationId } });
        }
      }

      await tx.user.delete({ where: { id: session.id } });
    });

    if (token) await deleteSession(token);
    cookieStore.delete(SESSION_COOKIE);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
