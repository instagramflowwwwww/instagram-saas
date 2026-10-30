import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { Prisma } from "@prisma/client"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Period = {
  start: Date
  end: Date
  previousStart: Date
  previousEnd: Date
}

type SummaryCountsRow = {
  publishedCurrent: bigint
  publishedPrevious: bigint
  scheduledCurrent: bigint
  scheduledPrevious: bigint
  failuresCurrent: bigint
  failuresPrevious: bigint
  newAccountsCurrent: bigint
  newAccountsPrevious: bigint
  queueCount: bigint
  viewsToday: bigint | null
  viewsYesterday: bigint | null
  viewsTotal: bigint | null
  publishedToday: bigint
  publishedYesterday: bigint
}

const BRAZIL_OFFSET = "-03:00"

function parseDate(value: string | null, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const time = endOfDay ? "23:59:59.999" : "00:00:00.000"
  const date = new Date(`${value}T${time}${BRAZIL_OFFSET}`)

  return Number.isNaN(date.getTime()) ? null : date
}

function getPeriod(request: Request): Period | null {
  const { searchParams } = new URL(request.url)
  const today = new Date()
  const defaultEnd = new Date(
    `${today.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}T23:59:59.999${BRAZIL_OFFSET}`
  )
  const defaultStart = new Date(defaultEnd)
  defaultStart.setDate(defaultStart.getDate() - 30)
  defaultStart.setHours(0, 0, 0, 0)

  const start = parseDate(searchParams.get("from")) || defaultStart
  const end = parseDate(searchParams.get("to"), true) || defaultEnd

  if (start.getTime() > end.getTime()) return null

  const duration = end.getTime() - start.getTime() + 1
  const previousEnd = new Date(start.getTime() - 1)
  const previousStart = new Date(previousEnd.getTime() - duration + 1)

  return { start, end, previousStart, previousEnd }
}

function trend(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null
  return Math.round(((current - previous) / previous) * 100)
}

function uniqueAccounts(
  logs: Array<{
    instagramAccount: {
      id: string
      username: string
      profilePicture: string | null
    }
  }>
) {
  const map = new Map<
    string,
    { id: string; username: string; profilePicture: string | null }
  >()

  logs.forEach((log) => {
    map.set(log.instagramAccount.id, log.instagramAccount)
  })

  return Array.from(map.values())
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const period = getPeriod(request)

  if (!period) {
    return NextResponse.json(
      { error: "O período informado é inválido." },
      { status: 400 }
    )
  }

  const userId = session.user.id
  const now = new Date()
  const currentRange = { gte: period.start, lte: period.end }

  // Limites do dia de hoje e de ontem, no fuso de Brasília — independentes
  // do filtro de período da tela, pra alimentar os cartões "hoje".
  const todayKey = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
  const todayStart = new Date(`${todayKey}T00:00:00.000${BRAZIL_OFFSET}`)
  const todayEnd = new Date(`${todayKey}T23:59:59.999${BRAZIL_OFFSET}`)
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000)
  const yesterdayEnd = new Date(todayStart.getTime() - 1)

  try {
    // O dashboard agora faz três round-trips principais ao banco: contas,
    // resumo agregado e posts recentes. Antes eram cerca de dez consultas.
    const [accounts, summaryRows, recentPosts, upcomingPosts] = await Promise.all([
      prisma.instagramAccount.findMany({
        where: {
          userId,
          connectionType: "official",
          isActive: true,
          accessToken: { not: null },
          appConfigId: { not: null },
          tokenExpiresAt: { gt: now },
        },
        select: {
          id: true,
          username: true,
          name: true,
          accountType: true,
          profilePicture: true,
          followerCount: true,
          mediaCount: true,
          isActive: true,
          tokenExpiresAt: true,
          lastActiveAt: true,
          createdAt: true,
        },
        orderBy: [
          { isActive: "desc" },
          { followerCount: "desc" },
          { createdAt: "desc" },
        ],
      }),
      prisma.$queryRaw<SummaryCountsRow[]>(Prisma.sql`
        SELECT
          (
            SELECT COUNT(*)
            FROM "Post" p
            WHERE p."userId" = ${userId}
              AND p."status" IN ('published', 'partial')
              AND p."publishedAt" >= ${period.start}
              AND p."publishedAt" <= ${period.end}
          ) AS "publishedCurrent",
          (
            SELECT COUNT(*)
            FROM "Post" p
            WHERE p."userId" = ${userId}
              AND p."status" IN ('published', 'partial')
              AND p."publishedAt" >= ${period.previousStart}
              AND p."publishedAt" <= ${period.previousEnd}
          ) AS "publishedPrevious",
          (
            SELECT COUNT(*)
            FROM "Post" p
            WHERE p."userId" = ${userId}
              AND p."status" = 'scheduled'
              AND p."scheduledAt" >= ${period.start}
              AND p."scheduledAt" <= ${period.end}
          ) AS "scheduledCurrent",
          (
            SELECT COUNT(*)
            FROM "Post" p
            WHERE p."userId" = ${userId}
              AND p."status" = 'scheduled'
              AND p."scheduledAt" >= ${period.previousStart}
              AND p."scheduledAt" <= ${period.previousEnd}
          ) AS "scheduledPrevious",
          (
            SELECT COUNT(*)
            FROM "PostLog" pl
            INNER JOIN "Post" p ON p."id" = pl."postId"
            INNER JOIN "InstagramAccount" ia ON ia."id" = pl."instagramAccountId"
            WHERE p."userId" = ${userId}
              AND pl."status" = 'error'
              AND pl."createdAt" >= ${period.start}
              AND pl."createdAt" <= ${period.end}
              AND ia."connectionType" = 'official'
              AND ia."isActive" = true
              AND ia."accessToken" IS NOT NULL
              AND ia."appConfigId" IS NOT NULL
              AND ia."tokenExpiresAt" > ${now}
          ) AS "failuresCurrent",
          (
            SELECT COUNT(*)
            FROM "PostLog" pl
            INNER JOIN "Post" p ON p."id" = pl."postId"
            INNER JOIN "InstagramAccount" ia ON ia."id" = pl."instagramAccountId"
            WHERE p."userId" = ${userId}
              AND pl."status" = 'error'
              AND pl."createdAt" >= ${period.previousStart}
              AND pl."createdAt" <= ${period.previousEnd}
              AND ia."connectionType" = 'official'
              AND ia."isActive" = true
              AND ia."accessToken" IS NOT NULL
              AND ia."appConfigId" IS NOT NULL
              AND ia."tokenExpiresAt" > ${now}
          ) AS "failuresPrevious",
          (
            SELECT COUNT(*)
            FROM "InstagramAccount" ia
            WHERE ia."userId" = ${userId}
              AND ia."connectionType" = 'official'
              AND ia."isActive" = true
              AND ia."accessToken" IS NOT NULL
              AND ia."appConfigId" IS NOT NULL
              AND ia."tokenExpiresAt" > ${now}
              AND ia."createdAt" >= ${period.start}
              AND ia."createdAt" <= ${period.end}
          ) AS "newAccountsCurrent",
          (
            SELECT COUNT(*)
            FROM "InstagramAccount" ia
            WHERE ia."userId" = ${userId}
              AND ia."connectionType" = 'official'
              AND ia."isActive" = true
              AND ia."accessToken" IS NOT NULL
              AND ia."appConfigId" IS NOT NULL
              AND ia."tokenExpiresAt" > ${now}
              AND ia."createdAt" >= ${period.previousStart}
              AND ia."createdAt" <= ${period.previousEnd}
          ) AS "newAccountsPrevious",
          (
            SELECT COUNT(*)
            FROM "PostingBatchItem" pbi
            INNER JOIN "PostingBatch" pb ON pb."id" = pbi."batchId"
            WHERE pb."userId" = ${userId}
              AND pbi."status" IN ('pending', 'processing')
          ) AS "queueCount",
          (
            SELECT COALESCE(SUM(pl."performanceViewsCount"), 0)
            FROM "PostLog" pl
            INNER JOIN "Post" p ON p."id" = pl."postId"
            WHERE p."userId" = ${userId}
              AND pl."performancePublishedAt" >= ${todayStart}
              AND pl."performancePublishedAt" <= ${todayEnd}
          ) AS "viewsToday",
          (
            SELECT COALESCE(SUM(pl."performanceViewsCount"), 0)
            FROM "PostLog" pl
            INNER JOIN "Post" p ON p."id" = pl."postId"
            WHERE p."userId" = ${userId}
              AND pl."performancePublishedAt" >= ${yesterdayStart}
              AND pl."performancePublishedAt" <= ${yesterdayEnd}
          ) AS "viewsYesterday",
          (
            SELECT COALESCE(SUM(pl."performanceViewsCount"), 0)
            FROM "PostLog" pl
            INNER JOIN "Post" p ON p."id" = pl."postId"
            WHERE p."userId" = ${userId}
          ) AS "viewsTotal",
          (
            SELECT COUNT(*)
            FROM "Post" p
            WHERE p."userId" = ${userId}
              AND p."status" IN ('published', 'partial')
              AND p."publishedAt" >= ${todayStart}
              AND p."publishedAt" <= ${todayEnd}
          ) AS "publishedToday",
          (
            SELECT COUNT(*)
            FROM "Post" p
            WHERE p."userId" = ${userId}
              AND p."status" IN ('published', 'partial')
              AND p."publishedAt" >= ${yesterdayStart}
              AND p."publishedAt" <= ${yesterdayEnd}
          ) AS "publishedYesterday"
      `),
      prisma.post.findMany({
        where: {
          userId,
          OR: [
            { createdAt: currentRange },
            { publishedAt: currentRange },
            { scheduledAt: currentRange },
          ],
        },
        select: {
          id: true,
          caption: true,
          hashtags: true,
          imageUrl: true,
          videoUrl: true,
          status: true,
          createdAt: true,
          publishedAt: true,
          scheduledAt: true,
          logs: {
            where: {
              instagramAccount: {
                connectionType: "official",
                isActive: true,
                accessToken: { not: null },
                appConfigId: { not: null },
                tokenExpiresAt: { gt: now },
              },
            },
            select: {
              status: true,
              errorMessage: true,
              instagramAccount: {
                select: {
                  id: true,
                  username: true,
                  profilePicture: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.post.findMany({
        where: { userId, status: "scheduled", scheduledAt: { gte: now } },
        orderBy: { scheduledAt: "asc" },
        take: 5,
        select: {
          id: true,
          caption: true,
          videoUrl: true,
          publicationType: true,
          scheduledAt: true,
          batchItem: { select: { instagramAccountId: true } },
        },
      }),
    ])

    const upcomingAccountIds = Array.from(
      new Set(
        upcomingPosts
          .map((post) => post.batchItem?.instagramAccountId)
          .filter((id): id is string => Boolean(id))
      )
    )
    const upcomingAccounts = upcomingAccountIds.length
      ? await prisma.instagramAccount.findMany({
          where: { id: { in: upcomingAccountIds } },
          select: { id: true, username: true, profilePicture: true },
        })
      : []
    const upcomingAccountMap = new Map(
      upcomingAccounts.map((account) => [account.id, account])
    )

    const counts = summaryRows[0]
    const published = Number(counts?.publishedCurrent || 0)
    const previousPublished = Number(counts?.publishedPrevious || 0)
    const scheduled = Number(counts?.scheduledCurrent || 0)
    const previousScheduled = Number(counts?.scheduledPrevious || 0)
    const failures = Number(counts?.failuresCurrent || 0)
    const previousFailures = Number(counts?.failuresPrevious || 0)
    const newAccounts = Number(counts?.newAccountsCurrent || 0)
    const previousNewAccounts = Number(counts?.newAccountsPrevious || 0)
    const queueCount = Number(counts?.queueCount || 0)
    const viewsToday = Number(counts?.viewsToday || 0)
    const viewsYesterday = Number(counts?.viewsYesterday || 0)
    const viewsTotal = Number(counts?.viewsTotal || 0)
    const publishedToday = Number(counts?.publishedToday || 0)
    const publishedYesterday = Number(counts?.publishedYesterday || 0)

    const totalFollowers = accounts.reduce(
      (sum, account) => sum + (account.followerCount || 0),
      0
    )
    const totalMedia = accounts.reduce(
      (sum, account) => sum + (account.mediaCount || 0),
      0
    )

    return NextResponse.json({
      period: {
        from: period.start.toISOString(),
        to: period.end.toISOString(),
      },
      summary: {
        accounts: {
          value: accounts.length,
          totalConfigured: accounts.length,
          newInPeriod: newAccounts,
          trend: trend(newAccounts, previousNewAccounts),
        },
        published: {
          value: published,
          trend: trend(published, previousPublished),
        },
        scheduled: {
          value: scheduled,
          trend: trend(scheduled, previousScheduled),
        },
        failures: {
          value: failures,
          trend: trend(failures, previousFailures),
        },
        queue: {
          value: queueCount,
        },
      },
      today: {
        views: viewsToday,
        viewsTrend: trend(viewsToday, viewsYesterday),
        viewsTotal,
        published: publishedToday,
        publishedYesterday,
      },
      audience: {
        totalFollowers,
        totalMedia,
        averageFollowers:
          accounts.length > 0 ? Math.round(totalFollowers / accounts.length) : 0,
      },
      accounts: accounts.slice(0, 6).map((account) => ({
        ...account,
        requiresReconnect: false,
      })),
      recentPosts: recentPosts.map((post) => {
        const successCount = post.logs.filter(
          (log) => log.status === "success"
        ).length
        const errorLogs = post.logs.filter((log) => log.status === "error")

        return {
          id: post.id,
          caption: post.caption || post.hashtags || "Publicação sem legenda",
          kind: post.videoUrl ? "Reel" : "Imagem",
          thumbnailUrl: post.imageUrl,
          status: post.status,
          createdAt: post.createdAt,
          publishedAt: post.publishedAt,
          scheduledAt: post.scheduledAt,
          successCount,
          errorCount: errorLogs.length,
          errorMessage: errorLogs[0]?.errorMessage || null,
          accounts: uniqueAccounts(post.logs),
        }
      }),
      upcomingPosts: upcomingPosts.map((post) => {
        const account = post.batchItem?.instagramAccountId
          ? upcomingAccountMap.get(post.batchItem.instagramAccountId) || null
          : null

        return {
          id: post.id,
          caption: post.caption || "Publicação sem legenda",
          kind: post.videoUrl ? "Reel" : "Imagem",
          publicationType: post.publicationType,
          scheduledAt: post.scheduledAt,
          account,
        }
      }),
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Dashboard stats error", error)
    return NextResponse.json(
      { error: "Não foi possível carregar os dados do dashboard." },
      { status: 500 }
    )
  }
}
