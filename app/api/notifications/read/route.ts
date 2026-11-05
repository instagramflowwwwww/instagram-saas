import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const userId = session.user.id

  if (body.all === true) {
    const notifications = await prisma.notification.findMany({
      where: { reads: { none: { userId } } },
      select: { id: true },
    })

    await prisma.notificationRead.createMany({
      data: notifications.map((notification) => ({
        notificationId: notification.id,
        userId,
      })),
      skipDuplicates: true,
    })

    return NextResponse.json({ success: true })
  }

  const id = String(body.id || "").trim()
  if (!id) {
    return NextResponse.json({ error: "Informe o aviso a marcar." }, { status: 400 })
  }

  await prisma.notificationRead.upsert({
    where: { notificationId_userId: { notificationId: id, userId } },
    create: { notificationId: id, userId },
    update: {},
  })

  return NextResponse.json({ success: true })
}
