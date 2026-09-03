import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requiresInstagramReconnect } from "@/lib/instagram-account-lifecycle"

export const runtime = "nodejs"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const groups = await prisma.accountGroup.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: {
      members: {
        include: {
          instagramAccount: {
            select: {
              id: true,
              username: true,
              profilePicture: true,
              isActive: true,
              connectionType: true,
              accessToken: true,
              appConfigId: true,
              tokenExpiresAt: true,
            },
          },
        },
      },
    },
  })

  // requiresReconnect não é coluna do banco: é derivado do estado da conta,
  // com o mesmo critério usado em /api/instagram/accounts.
  const serialized = groups.map((group) => ({
    ...group,
    members: group.members.map((member) => {
      const { accessToken, appConfigId, tokenExpiresAt, ...account } =
        member.instagramAccount

      return {
        ...member,
        instagramAccount: {
          ...account,
          requiresReconnect: requiresInstagramReconnect({
            connectionType: account.connectionType,
            isActive: account.isActive,
            accessToken,
            appConfigId,
            tokenExpiresAt,
          }),
        },
      }
    }),
  }))

  return NextResponse.json(serialized)
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const name = String(body.name || "").trim().slice(0, 50)
  const color = String(body.color || "").trim() || null

  if (!name) {
    return NextResponse.json({ error: "Informe um nome para a pasta." }, { status: 400 })
  }

  const group = await prisma.accountGroup.create({
    data: { userId: session.user.id, name, color },
    include: { members: true },
  })

  return NextResponse.json(group)
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const groupId = String(body.groupId || "").trim()
  const name = String(body.name || "").trim().slice(0, 50)
  const color = String(body.color || "").trim() || null

  if (!groupId) return NextResponse.json({ error: "ID da pasta não informado." }, { status: 400 })
  if (!name) return NextResponse.json({ error: "Informe um nome." }, { status: 400 })

  const group = await prisma.accountGroup.findFirst({
    where: { id: groupId, userId: session.user.id },
  })
  if (!group) return NextResponse.json({ error: "Pasta não encontrada." }, { status: 404 })

  const updated = await prisma.accountGroup.update({
    where: { id: groupId },
    data: { name, color },
    include: { members: true },
  })

  return NextResponse.json(updated)
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const groupId = String(body.groupId || "").trim()

  if (!groupId) return NextResponse.json({ error: "ID da pasta não informado." }, { status: 400 })

  const group = await prisma.accountGroup.findFirst({
    where: { id: groupId, userId: session.user.id },
  })
  if (!group) return NextResponse.json({ error: "Pasta não encontrada." }, { status: 404 })

  await prisma.accountGroup.delete({ where: { id: groupId } })

  return NextResponse.json({ success: true })
}
