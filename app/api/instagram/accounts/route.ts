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
      profilePicture: true,
      followerCount: true,
      isActive: true,
      proxy: true,
      lastActiveAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json(accounts)
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const { id } = await request.json()

  if (!id) {
    return NextResponse.json({ error: "Conta inválida" }, { status: 400 })
  }

  const result = await prisma.instagramAccount.deleteMany({
    where: {
      id: String(id),
      userId: session.user.id,
    },
  })

  if (result.count === 0) {
    return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
