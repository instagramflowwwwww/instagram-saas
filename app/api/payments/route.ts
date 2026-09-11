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
    }
  })

  const totals = {
    today: employees.reduce((sum, employee) => sum + employee.today.amount, 0),
    last7: employees.reduce((sum, employee) => sum + employee.last7.amount, 0),
    last30: employees.reduce((sum, employee) => sum + employee.last30.amount, 0),
  }

  return NextResponse.json({ employees, totals })
}
