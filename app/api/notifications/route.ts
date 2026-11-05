import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const LIST_LIMIT = 20

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    select: {
      id: true,
      title: true,
      message: true,
      createdAt: true,
      reads: {
        where: { userId: session.user.id },
        select: { id: true },
      },
    },
  })

  const items = notifications.map((notification) => ({
    id: notification.id,
    title: notification.title,
    message: notification.message,
    createdAt: notification.createdAt,
    read: notification.reads.length > 0,
  }))

  return NextResponse.json({
    notifications: items,
    unreadCount: items.filter((item) => !item.read).length,
  })
}
