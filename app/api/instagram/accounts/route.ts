import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const accounts = await prisma.instagramAccount.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      username: true,
      name: true,
      accountType: true,
      profilePicture: true,
      followerCount: true,
      mediaCount: true,
      connectionType: true,
      isActive: true,
      tokenExpiresAt: true,
      lastActiveAt: true,
      createdAt: true,
      appConfig: {
        select: {
          metaAppId: true,
        },
      },
    },
  })

  return NextResponse.json(
    accounts.map((account) => ({
      ...account,
      appId: account.appConfig?.metaAppId || null,
      appConfig: undefined,
      requiresReconnect:
        account.connectionType !== "official" ||
        !account.tokenExpiresAt ||
        account.tokenExpiresAt.getTime() <= Date.now(),
    }))
  )
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const id = String(body.id || "")

  if (!id) {
    return NextResponse.json({ error: "Conta inválida" }, { status: 400 })
  }

  const result = await prisma.instagramAccount.deleteMany({
    where: {
      id,
      userId: session.user.id,
    },
  })

  if (result.count === 0) {
    return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
