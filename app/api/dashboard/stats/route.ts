import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
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
  const currentRange = { gte: period.start, lte: period.end }
  const previousRange = {
    gte: period.previousStart,
    lte: period.previousEnd,
  }

  try {
    const [
      accounts,
      published,
      previousPublished,
      scheduled,
      previousScheduled,
      failures,
      previousFailures,
      newAccounts,
      previousNewAccounts,
      recentPosts,
    ] = await Promise.all([
      prisma.instagramAccount.findMany({
        where: {
          userId,
          connectionType: "official",
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
      prisma.post.count({
        where: {
          userId,
          status: { in: ["published", "partial"] },
          publishedAt: currentRange,
        },
      }),
      prisma.post.count({
        where: {
          userId,
          status: { in: ["published", "partial"] },
          publishedAt: previousRange,
        },
      }),
      prisma.post.count({
        where: {
          userId,
          status: "scheduled",
          scheduledAt: currentRange,
        },
      }),
      prisma.post.count({
        where: {
          userId,
          status: "scheduled",
          scheduledAt: previousRange,
        },
      }),
      prisma.postLog.count({
        where: {
          status: "error",
          createdAt: currentRange,
          post: { userId },
        },
      }),
      prisma.postLog.count({
        where: {
          status: "error",
          createdAt: previousRange,
          post: { userId },
        },
      }),
      prisma.instagramAccount.count({
        where: {
          userId,
          connectionType: "official",
          createdAt: currentRange,
        },
      }),
      prisma.instagramAccount.count({
        where: {
          userId,
          connectionType: "official",
          createdAt: previousRange,
        },
      }),
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
    ])

    const activeAccounts = accounts.filter(
      (account) =>
        account.isActive &&
        (!account.tokenExpiresAt || account.tokenExpiresAt.getTime() > Date.now())
    )
    const totalFollowers = activeAccounts.reduce(
      (sum, account) => sum + (account.followerCount || 0),
      0
    )
    const totalMedia = activeAccounts.reduce(
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
          value: activeAccounts.length,
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
      },
      audience: {
        totalFollowers,
        totalMedia,
        averageFollowers:
          activeAccounts.length > 0
            ? Math.round(totalFollowers / activeAccounts.length)
            : 0,
      },
      accounts: accounts.slice(0, 6).map((account) => ({
        ...account,
        requiresReconnect:
          !account.isActive ||
          Boolean(
            account.tokenExpiresAt &&
              account.tokenExpiresAt.getTime() <= Date.now()
          ),
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
