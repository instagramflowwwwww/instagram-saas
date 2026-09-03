import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { accountFellAt, requiresInstagramReconnect } from "@/lib/instagram-account-lifecycle"
import { countByDay, windowStats } from "@/lib/day-metrics"

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
              lastActiveAt: true,
            },
          },
        },
      },
    },
  })

  const now = Date.now()

  // requiresReconnect não é coluna do banco: é derivado do estado da conta,
  // com o mesmo critério usado em /api/instagram/accounts. E as estatísticas
  // da pasta usam o mesmo critério de "quando entrou" e "quando caiu" que a
  // tela de Saúde das contas — só que "entrou" aqui é a data em que a conta
  // foi adicionada a ESTA pasta (AccountGroupMember.createdAt), não a data em
  // que ela foi conectada ao Instagram.
  const serialized = groups.map((group) => {
    const members = group.members.map((member) => {
      const { accessToken, appConfigId, tokenExpiresAt, lastActiveAt, ...account } =
        member.instagramAccount

      const state = {
        connectionType: account.connectionType,
        isActive: account.isActive,
        accessToken,
        appConfigId,
        tokenExpiresAt,
        lastActiveAt,
      }

      return {
        ...member,
        instagramAccount: {
          ...account,
          requiresReconnect: requiresInstagramReconnect(state),
        },
        fellAt: accountFellAt(state, now),
      }
    })

    const addedCounts = countByDay(members.map((member) => member.createdAt))
    const droppedCounts = countByDay(
      members
        .map((member) => member.fellAt)
        .filter((date): date is Date => date !== null)
    )
    const droppedNow = members.filter((member) => member.fellAt !== null).length

    return {
      ...group,
      members: members.map(({ fellAt, ...member }) => member),
      stats: {
        added: windowStats(addedCounts),
        dropped: windowStats(droppedCounts),
        droppedNow,
      },
    }
  })

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
