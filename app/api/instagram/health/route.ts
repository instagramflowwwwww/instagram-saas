import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  INSTAGRAM_DISCONNECTED_CONNECTION,
  requiresInstagramReconnect,
} from "@/lib/instagram-account-lifecycle"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// As contas são conectadas no fuso do usuário, não em UTC. Agrupar por dia em
// UTC jogaria tudo que entra depois das 21h para o dia seguinte.
const TIME_ZONE = "America/Sao_Paulo"
const DAYS = 30

function localDay(date: Date) {
  // en-CA devolve no formato AAAA-MM-DD, que ordena sozinho.
  return date.toLocaleDateString("en-CA", { timeZone: TIME_ZONE })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const accounts = await prisma.instagramAccount.findMany({
    where: { userId: session.user.id },
    select: {
      createdAt: true,
      connectionType: true,
      isActive: true,
      accessToken: true,
      appConfigId: true,
      tokenExpiresAt: true,
    },
    orderBy: { createdAt: "asc" },
  })

  const counts = new Map<string, number>()
  for (const account of accounts) {
    const day = localDay(account.createdAt)
    counts.set(day, (counts.get(day) || 0) + 1)
  }

  // Série contínua: dias sem nenhuma conta precisam aparecer como zero,
  // senão o gráfico mente sobre o ritmo.
  const today = localDay(new Date())
  const series: { day: string; count: number }[] = []
  for (let ago = DAYS - 1; ago >= 0; ago -= 1) {
    const date = new Date()
    date.setUTCDate(date.getUTCDate() - ago)
    const day = localDay(date)
    series.push({ day, count: counts.get(day) || 0 })
  }

  const yesterday = series.length >= 2 ? series[series.length - 2].day : today

  const connected = accounts.filter(
    (account) => !requiresInstagramReconnect(account)
  ).length
  const disconnected = accounts.filter(
    (account) => account.connectionType === INSTAGRAM_DISCONNECTED_CONNECTION
  ).length

  const last7 = series.slice(-7).reduce((total, entry) => total + entry.count, 0)
  const last30 = series.reduce((total, entry) => total + entry.count, 0)

  const firstAccount = accounts[0]?.createdAt || null
  const activeDays = series.filter((entry) => entry.count > 0).length

  return NextResponse.json(
    {
      today: counts.get(today) || 0,
      yesterday: counts.get(yesterday) || 0,
      last7,
      last30,
      total: accounts.length,
      connected,
      needsReconnect: accounts.length - connected,
      disconnected,
      activeDays,
      firstAccountAt: firstAccount,
      series,
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  )
}
