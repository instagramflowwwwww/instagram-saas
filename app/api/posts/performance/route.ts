import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  PerformanceLog,
  cachedResult,
  isCacheFresh,
  refreshPerformanceLogs,
} from "@/lib/instagram-performance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

function parseDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    const requestUrl = new URL(request.url)
    const rawFrom = requestUrl.searchParams.get("from")
    const rawTo = requestUrl.searchParams.get("to")
    const from = parseDate(rawFrom)
    const to = parseDate(rawTo)
    const shouldRefresh = requestUrl.searchParams.get("refresh") === "1"
    const forceRefresh = requestUrl.searchParams.get("force") === "1"

    if ((rawFrom && !from) || (rawTo && !to)) {
      return NextResponse.json(
        { error: "Período informado é inválido." },
        { status: 400 }
      )
    }

    if (from && to && from.getTime() >= to.getTime()) {
      return NextResponse.json(
        { error: "A data inicial precisa ser anterior à data final." },
        { status: 400 }
      )
    }

    const createdAt =
      from || to
        ? {
            ...(from ? { gte: from } : {}),
            ...(to ? { lt: to } : {}),
          }
        : undefined

    const logs = (await prisma.postLog.findMany({
      where: {
        status: "success",
        mediaId: { not: null },
        ...(createdAt ? { createdAt } : {}),
        post: { userId: session.user.id, publicationType: "post" },
        instagramAccount: {
          connectionType: "official",
          isActive: true,
          accessToken: { not: null },
          appConfigId: { not: null },
          tokenExpiresAt: { gt: new Date() },
        },
      },
      select: {
        id: true,
        mediaId: true,
        instagramAccountId: true,
        createdAt: true,
        performancePermalink: true,
        performanceLikeCount: true,
        performanceCommentsCount: true,
        performanceViewsCount: true,
        performanceViewsMetric: true,
        performanceMediaType: true,
        performanceMediaProductType: true,
        performancePublishedAt: true,
        performanceUpdatedAt: true,
        performanceError: true,
        post: {
          select: {
            caption: true,
          },
        },
        instagramAccount: {
          select: {
            id: true,
            username: true,
            profilePicture: true,
            accessToken: true,
            tokenExpiresAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })) as PerformanceLog[]

    const seen = new Set<string>()
    const uniqueLogs = logs.filter((log) => {
      const key = `${log.instagramAccountId}:${log.mediaId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    const now = Date.now()

    if (!shouldRefresh) {
      return NextResponse.json(
        uniqueLogs.map((log) => cachedResult(log, now)),
        {
          headers: {
            "Cache-Control": "private, no-store, max-age=0",
          },
        }
      )
    }

    const logsToRefresh = forceRefresh
      ? uniqueLogs
      : uniqueLogs.filter((log) => !isCacheFresh(log, now))

    if (logsToRefresh.length === 0) {
      return NextResponse.json(
        uniqueLogs.map((log) => cachedResult(log, now)),
        {
          headers: {
            "Cache-Control": "private, no-store, max-age=0",
          },
        }
      )
    }

    const refreshedResults = await refreshPerformanceLogs(logsToRefresh, now)

    const refreshedById = new Map(
      refreshedResults.map((result) => [result.id, result])
    )

    const activeAccountIds = new Set(
      (
        await prisma.instagramAccount.findMany({
          where: {
            id: { in: uniqueLogs.map((log) => log.instagramAccountId) },
            userId: session.user.id,
            connectionType: "official",
            isActive: true,
            accessToken: { not: null },
            appConfigId: { not: null },
            tokenExpiresAt: { gt: new Date() },
          },
          select: { id: true },
        })
      ).map((account) => account.id)
    )

    const response = uniqueLogs
      .filter((log) => activeAccountIds.has(log.instagramAccountId))
      .map((log) => refreshedById.get(log.id) || cachedResult(log, now))

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    })
  } catch (error) {
    console.error("Instagram performance error", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar a performance.",
      },
      { status: 500 }
    )
  }
}
