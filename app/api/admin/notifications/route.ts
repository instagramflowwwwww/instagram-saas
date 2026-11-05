import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { isAdminEmail } from "@/lib/account-access"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      message: true,
      createdAt: true,
      _count: { select: { reads: true } },
    },
  })

  return NextResponse.json({
    notifications: notifications.map((notification) => ({
      id: notification.id,
      title: notification.title,
      message: notification.message,
      createdAt: notification.createdAt,
      readCount: notification._count.reads,
    })),
  })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)

  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const title = String(body.title || "").trim().slice(0, 120)
  const message = String(body.message || "").trim().slice(0, 2000)

  if (!title || !message) {
    return NextResponse.json(
      { error: "Preencha o título e a mensagem." },
      { status: 400 }
    )
  }

  const notification = await prisma.notification.create({
    data: { title, message },
    select: { id: true, title: true, message: true, createdAt: true },
  })

  return NextResponse.json({
    message: "Aviso enviado pra todo mundo.",
    notification: { ...notification, readCount: 0 },
  })
}
