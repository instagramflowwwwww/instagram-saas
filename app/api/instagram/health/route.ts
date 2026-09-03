import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  INSTAGRAM_DISCONNECTED_CONNECTION,
  accountFellAt,
  instagramDisconnectDeadline,
  requiresInstagramReconnect,
} from "@/lib/instagram-account-lifecycle"
import { countByDay, recentSeries, windowStats } from "@/lib/day-metrics"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DAYS = 30

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const accounts = await prisma.instagramAccount.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      username: true,
      profilePicture: true,
      createdAt: true,
      lastActiveAt: true,
      connectionType: true,
      isActive: true,
      accessToken: true,
      appConfigId: true,
      tokenExpiresAt: true,
    },
    orderBy: { createdAt: "asc" },
  })

  const counts = countByDay(accounts.map((account) => account.createdAt))

  const now = Date.now()
  const dropDates = accounts
    .map((account) => accountFellAt(account, now))
    .filter((date): date is Date => date !== null)
  const drops = countByDay(dropDates)

  const series = recentSeries(counts, DAYS)
  const added = windowStats(counts)
  const dropped = windowStats(drops)

  const connected = accounts.filter(
    (account) => !requiresInstagramReconnect(account)
  ).length
  const disconnected = accounts.filter(
    (account) => account.connectionType === INSTAGRAM_DISCONNECTED_CONNECTION
  ).length

  // As duas listas que interessam de fato: quem caiu e quem está de pé.
  const toSummary = (account: (typeof accounts)[number]) => ({
    id: account.id,
    username: account.username,
    profilePicture: account.profilePicture,
    createdAt: account.createdAt,
    lastActiveAt: account.lastActiveAt,
    tokenExpiresAt: account.tokenExpiresAt,
    autoDeleteAt: instagramDisconnectDeadline(account),
  })

  const offline = accounts
    .filter((account) => requiresInstagramReconnect(account))
    .sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime())
    .map(toSummary)

  const online = accounts
    .filter((account) => !requiresInstagramReconnect(account))
    .sort((a, b) => a.username.localeCompare(b.username))
    .map(toSummary)

  const firstAccount = accounts[0]?.createdAt || null
  const activeDays = series.filter((entry) => entry.count > 0).length

  return NextResponse.json(
    {
      today: added.today,
      yesterday: added.yesterday,
      droppedToday: dropped.today,
      droppedYesterday: dropped.yesterday,
      last7: added.last7,
      last30: added.last30,
      total: accounts.length,
      connected,
      needsReconnect: accounts.length - connected,
      disconnected,
      activeDays,
      firstAccountAt: firstAccount,
      series,
      // Todo o histórico por dia, para o calendário poder voltar meses.
      // São poucas linhas: um número por dia em que houve conta.
      daily: Object.fromEntries(counts),
      dailyDrops: Object.fromEntries(drops),
      offline,
      online,
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  )
}
