import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

const BRAZIL_OFFSET = "-03:00"
const RANKING_LIMIT = 5

type RankingRow = {
  userId: string
  name: string | null
  accountsCount: bigint | number
  viewsToday: bigint | number | null
  postsCount: bigint | number
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

  const rows = await prisma.$queryRaw<RankingRow[]>`
    SELECT
      u."id" AS "userId",
      u."name",
      (
        SELECT COUNT(*)
        FROM "InstagramAccount" ia
        WHERE ia."userId" = u."id" AND ia."isActive" = true
      ) AS "accountsCount",
      (
        SELECT COALESCE(SUM(pl."performanceViewsCount"), 0)
        FROM "PostLog" pl
        INNER JOIN "Post" p ON p."id" = pl."postId"
        WHERE p."userId" = u."id"
          AND pl."performancePublishedAt" >= ${todayStart}
          AND pl."performancePublishedAt" <= ${todayEnd}
      ) AS "viewsToday",
      (
        SELECT COUNT(*)
        FROM "PostLog" pl
        INNER JOIN "Post" p ON p."id" = pl."postId"
        WHERE p."userId" = u."id"
          AND pl."status" = 'success'
          AND pl."createdAt" >= ${todayStart}
          AND pl."createdAt" <= ${todayEnd}
      ) AS "postsCount"
    FROM "User" u
    WHERE u."accessStatus" = 'approved'
  `

  const ranked = rows
    .map((row) => ({
      userId: row.userId,
      name: displayName(row.name, row.userId),
      accountsCount: Number(row.accountsCount),
      viewsToday: Number(row.viewsToday || 0),
      postsCount: Number(row.postsCount),
    }))
    .filter((row) => row.viewsToday > 0)
    .sort((a, b) => b.viewsToday - a.viewsToday)
    .map((row, index) => ({ ...row, rank: index + 1, isYou: row.userId === session.user.id }))

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
