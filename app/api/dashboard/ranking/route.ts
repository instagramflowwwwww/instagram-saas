import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { Prisma } from "@prisma/client"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BRAZIL_OFFSET = "-03:00"
const RANKING_LIMIT = 5

type UserStatsRow = {
  userId: string
  viewsToday: bigint | number | null
  postsCount: bigint | number
}

type AccountsCountRow = {
  userId: string
  accountsCount: bigint | number
}

function displayName(name: string | null, userId: string) {
  const trimmed = name?.trim()
  if (trimmed) return trimmed
  return `Usuário ${userId.slice(-4).toUpperCase()}`
}

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const todayKey = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  })
  const todayStart = new Date(`${todayKey}T00:00:00.000${BRAZIL_OFFSET}`)
  const todayEnd = new Date(`${todayKey}T23:59:59.999${BRAZIL_OFFSET}`)

  // Uma única varredura agregada (usa o índice em performancePublishedAt)
  // em vez de 2-3 subqueries correlacionadas por usuário cadastrado — só
  // traz quem de fato teve views hoje, não todo mundo que já se cadastrou.
  const userStats = await prisma.$queryRaw<UserStatsRow[]>`
    SELECT
      p."userId" AS "userId",
      COALESCE(SUM(pl."performanceViewsCount"), 0) AS "viewsToday",
      COUNT(*) AS "postsCount"
    FROM "PostLog" pl
    INNER JOIN "Post" p ON p."id" = pl."postId"
    WHERE pl."status" = 'success'
      AND pl."performancePublishedAt" >= ${todayStart}
      AND pl."performancePublishedAt" <= ${todayEnd}
    GROUP BY p."userId"
    HAVING COALESCE(SUM(pl."performanceViewsCount"), 0) > 0
  `

  const yourUserId = session.user.id
  const relevantUserIds = Array.from(
    new Set([...userStats.map((row) => row.userId), yourUserId])
  )

  if (relevantUserIds.length === 0) {
    return NextResponse.json({ updatedAt: new Date().toISOString(), ranking: [], you: null })
  }

  const [users, accountsCounts] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: relevantUserIds }, accessStatus: "approved" },
      select: { id: true, name: true, image: true },
    }),
    prisma.$queryRaw<AccountsCountRow[]>`
      SELECT "userId", COUNT(*) AS "accountsCount"
      FROM "InstagramAccount"
      WHERE "userId" IN (${Prisma.join(relevantUserIds)}) AND "isActive" = true
      GROUP BY "userId"
    `,
  ])

  const userMap = new Map(users.map((user) => [user.id, user]))
  const accountsMap = new Map(
    accountsCounts.map((row) => [row.userId, Number(row.accountsCount)])
  )
  const statsMap = new Map(
    userStats.map((row) => [
      row.userId,
      { viewsToday: Number(row.viewsToday || 0), postsCount: Number(row.postsCount) },
    ])
  )

  const ranked = userStats
    .filter((row) => userMap.has(row.userId))
    .map((row) => {
      const stats = statsMap.get(row.userId)!
      const user = userMap.get(row.userId)
      return {
        userId: row.userId,
        name: displayName(user?.name || null, row.userId),
        image: user?.image || null,
        accountsCount: accountsMap.get(row.userId) || 0,
        viewsToday: stats.viewsToday,
        postsCount: stats.postsCount,
      }
    })
    .sort((a, b) => b.viewsToday - a.viewsToday)
    .map((row, index) => ({ ...row, rank: index + 1, isYou: row.userId === yourUserId }))

  const top = ranked.slice(0, RANKING_LIMIT)
  const yourRow = ranked.find((row) => row.isYou) || null
  const yourRankOutsideTop =
    yourRow && !top.some((row) => row.userId === yourRow.userId) ? yourRow : null

  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    ranking: top,
    you: yourRankOutsideTop,
  })
}
