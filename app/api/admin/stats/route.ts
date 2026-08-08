import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import {
  getEffectiveAccessStatus,
  isAdminEmail,
} from "@/lib/account-access"
import { authOptions } from "@/lib/auth"
import { maintainInstagramAccounts } from "@/lib/instagram-account-lifecycle"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await maintainInstagramAccounts()
  const now = new Date()

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      accessStatus: true,
      planName: true,
      planDurationDays: true,
      accessStartsAt: true,
      accessExpiresAt: true,
      approvedAt: true,
      rejectedAt: true,
      igAccounts: {
        where: {
          connectionType: "official",
          isActive: true,
          accessToken: { not: null },
          appConfigId: { not: null },
          tokenExpiresAt: { gt: now },
        },
        select: { id: true },
      },
      posts: { select: { id: true, status: true } },
    },
    orderBy: [{ accessStatus: "asc" }, { createdAt: "desc" }],
  })

  const formattedUsers = users.map((user) => {
    const effectiveStatus = getEffectiveAccessStatus(user)

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      accessStatus: user.accessStatus,
      effectiveStatus,
      planName: user.planName,
      planDurationDays: user.planDurationDays,
      accessStartsAt: user.accessStartsAt,
      accessExpiresAt: user.accessExpiresAt,
      approvedAt: user.approvedAt,
      rejectedAt: user.rejectedAt,
      isAdmin: isAdminEmail(user.email),
      accountsCount: user.igAccounts.length,
      postsCount: user.posts.length,
      publishedCount: user.posts.filter((post) => post.status === "published")
        .length,
    }
  })

  const countByStatus = (status: string) =>
    formattedUsers.filter((user) => user.effectiveStatus === status).length

  return NextResponse.json({
    totalUsers: formattedUsers.length,
    totalAccounts: formattedUsers.reduce(
      (total, user) => total + user.accountsCount,
      0
    ),
    totalPosts: formattedUsers.reduce(
      (total, user) => total + user.postsCount,
      0
    ),
    pendingUsers: countByStatus("pending"),
    activeUsers: countByStatus("approved"),
    expiredUsers: countByStatus("expired"),
    rejectedUsers: countByStatus("rejected"),
    users: formattedUsers,
  })
}
