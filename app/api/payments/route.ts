import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { countByDay, recentSeries, windowStats } from "@/lib/day-metrics"

export const runtime = "nodejs"

const SERIES_DAYS = 30

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const groups = await prisma.accountGroup.findMany({
    where: { userId: session.user.id, isEmployeeGroup: true },
    orderBy: { createdAt: "asc" },
    include: {
      members: { select: { createdAt: true } },
      paidDays: { select: { day: true } },
    },
  })

  // Um pagamento por conta que entrou na pasta: a data de entrada
  // (AccountGroupMember.createdAt) é o dia que o funcionário criou aquela
  // conta, então é isso que vira "quanto pagar nesse dia".
  const employees = groups.map((group) => {
    const counts = countByDay(group.members.map((member) => member.createdAt))
    const stats = windowStats(counts)
    const series = recentSeries(counts, SERIES_DAYS).map((entry) => ({
      day: entry.day,
      accounts: entry.count,
      amount: entry.count * group.payPerAccount,
    }))

    return {
      id: group.id,
      name: group.name,
      color: group.color,
      payPerAccount: group.payPerAccount,
      totalAccounts: group.members.length,
      today: { accounts: stats.today, amount: stats.today * group.payPerAccount },
      yesterday: { accounts: stats.yesterday, amount: stats.yesterday * group.payPerAccount },
      last7: { accounts: stats.last7, amount: stats.last7 * group.payPerAccount },
      last30: { accounts: stats.last30, amount: stats.last30 * group.payPerAccount },
      series,
      // Mapa completo dia -> contas, pra montar um calendário de qualquer mês
      // no cliente sem precisar de uma chamada nova a cada navegação.
      counts: Object.fromEntries(counts),
      paidDays: group.paidDays.map((entry) => entry.day),
    }
  })

  const totals = {
    today: employees.reduce((sum, employee) => sum + employee.today.amount, 0),
    last7: employees.reduce((sum, employee) => sum + employee.last7.amount, 0),
    last30: employees.reduce((sum, employee) => sum + employee.last30.amount, 0),
  }

  return NextResponse.json({ employees, totals })
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

async function findOwnedGroup(userId: string, groupId: string) {
  return prisma.accountGroup.findFirst({
    where: { id: groupId, userId, isEmployeeGroup: true },
    select: { id: true },
  })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const groupId = String(body.groupId || "").trim()
  const day = String(body.day || "").trim()

  if (!groupId || !DAY_PATTERN.test(day)) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })
  }

  const group = await findOwnedGroup(session.user.id, groupId)
  if (!group) return NextResponse.json({ error: "Pasta não encontrada." }, { status: 404 })

  await prisma.employeePaidDay.upsert({
    where: { groupId_day: { groupId, day } },
    create: { groupId, day },
    update: {},
  })

  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const groupId = String(body.groupId || "").trim()
  const day = String(body.day || "").trim()

  if (!groupId || !DAY_PATTERN.test(day)) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })
  }

  const group = await findOwnedGroup(session.user.id, groupId)
  if (!group) return NextResponse.json({ error: "Pasta não encontrada." }, { status: 404 })

  await prisma.employeePaidDay.deleteMany({ where: { groupId, day } })

  return NextResponse.json({ success: true })
}
