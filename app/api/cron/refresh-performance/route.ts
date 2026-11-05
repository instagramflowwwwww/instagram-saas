import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { refreshPerformanceLogs, type PerformanceLog } from "@/lib/instagram-performance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 280

// Antes, "views hoje" (dashboard, ranking geral) só atualizava quando o
// dono da conta abria a tela de Performance e clicava em atualizar — pra
// todo mundo ver os números frescos sem precisar disso, refaz o mesmo
// trabalho que o dashboard já fazia por usuário, só que pra toda a
// plataforma de uma vez, em lotes, periodicamente.
const BRAZIL_OFFSET = "-03:00"
const REFRESH_INTERVAL_MS = 10 * 60 * 1000
const MAX_LOGS_PER_RUN = 120

function authorized(request: Request) {
  const secret = process.env.QUEUE_CRON_SECRET?.trim()
  if (!secret) return false

  const authorization = request.headers.get("authorization")?.trim()
  const headerSecret = request.headers.get("x-cron-secret")?.trim()

  return authorization === `Bearer ${secret}` || headerSecret === secret
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    console.warn("[refresh-performance] Unauthorized request")
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const startedAt = Date.now()
  const now = Date.now()
  const staleCutoff = new Date(now - REFRESH_INTERVAL_MS)

  const todayKey = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  })
  const todayStart = new Date(`${todayKey}T00:00:00.000${BRAZIL_OFFSET}`)

  try {
    const candidates = (await prisma.postLog.findMany({
      where: {
        status: "success",
        mediaId: { not: null },
        post: { publicationType: "post", publishedAt: { gte: todayStart } },
        instagramAccount: {
          connectionType: "official",
          isActive: true,
          accessToken: { not: null },
          appConfigId: { not: null },
          tokenExpiresAt: { gt: new Date() },
        },
        OR: [{ performanceUpdatedAt: null }, { performanceUpdatedAt: { lt: staleCutoff } }],
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
        post: { select: { caption: true } },
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
      orderBy: { performanceUpdatedAt: { sort: "asc", nulls: "first" } },
      take: MAX_LOGS_PER_RUN,
    })) as unknown as PerformanceLog[]

    const results = candidates.length > 0 ? await refreshPerformanceLogs(candidates, now) : []

    const response = {
      checked: candidates.length,
      refreshed: results.length,
      durationMs: Date.now() - startedAt,
    }

    console.info("[refresh-performance] Checagem concluída", response)

    return NextResponse.json(response, { headers: { "Cache-Control": "no-store, max-age=0" } })
  } catch (error) {
    console.error("[refresh-performance] Falhou", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erro ao atualizar performance.",
        durationMs: Date.now() - startedAt,
      },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  return POST(request)
}
