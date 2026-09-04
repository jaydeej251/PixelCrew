import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdminSession } from "@/lib/admin-api";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await requireAdminSession();

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        email: true,
        name: true,
        platformRole: true,
        createdAt: true,
        _count: { select: { sessions: true, memberships: true } },
      },
    });

    return NextResponse.json({
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        platformRole: user.platformRole,
        createdAt: user.createdAt,
        sessionCount: user._count.sessions,
        membershipCount: user._count.memberships,
      })),
    });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
