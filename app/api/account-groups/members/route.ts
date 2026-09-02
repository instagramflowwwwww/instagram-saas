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
  const groupId = String(body.groupId || "").trim()
  const accountIds: string[] = Array.isArray(body.accountIds) ? body.accountIds : []

  if (!groupId) return NextResponse.json({ error: "ID da pasta não informado." }, { status: 400 })

  const group = await prisma.accountGroup.findFirst({
    where: { id: groupId, userId: session.user.id },
  })
  if (!group) return NextResponse.json({ error: "Pasta não encontrada." }, { status: 404 })

  const validAccounts = await prisma.instagramAccount.findMany({
    where: { id: { in: accountIds }, userId: session.user.id },
    select: { id: true },
  })

  const validIds = validAccounts.map((a) => a.id)

  await prisma.accountGroupMember.createMany({
    data: validIds.map((instagramAccountId) => ({ groupId, instagramAccountId })),
    skipDuplicates: true,
  })

  return NextResponse.json({ success: true, added: validIds.length })
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const groupId = String(body.groupId || "").trim()
  const accountIds: string[] = Array.isArray(body.accountIds) ? body.accountIds : []

  if (!groupId) return NextResponse.json({ error: "ID da pasta não informado." }, { status: 400 })

  const group = await prisma.accountGroup.findFirst({
    where: { id: groupId, userId: session.user.id },
  })
  if (!group) return NextResponse.json({ error: "Pasta não encontrada." }, { status: 404 })

  await prisma.accountGroupMember.deleteMany({
    where: { groupId, instagramAccountId: { in: accountIds } },
  })

  return NextResponse.json({ success: true })
}
