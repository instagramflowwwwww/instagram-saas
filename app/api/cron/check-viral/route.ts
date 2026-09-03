import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  PerformanceLog,
  PerformanceResult,
  cachedResult,
  isCacheFresh,
  refreshPerformanceLogs,
} from "@/lib/instagram-performance"
import { isPushConfigured, sendPushToUser } from "@/lib/web-push"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 280

const VIRAL_VIEWS_THRESHOLD = 50_000
// Vídeo com mais de 14 dias não vale mais a pena checar toda hora: se ainda
// não bombou até aqui, é bem improvável que bombe de repente amanhã.
const LOOKBACK_DAYS = 14
// Orçamento de chamadas à Meta por execução, para o cron não competir com o
// usuário abrindo a tela de Performance ao mesmo tempo.
const MAX_LOGS_PER_RUN = 60

type ViralCandidate = PerformanceLog & { post: { userId: string } }

function authorized(request: Request) {
  const secret = process.env.QUEUE_CRON_SECRET?.trim()
  if (!secret) return false

  const authorization = request.headers.get("authorization")?.trim()
  const headerSecret = request.headers.get("x-cron-secret")?.trim()

  return authorization === `Bearer ${secret}` || headerSecret === secret
}

function formatViews(count: number) {
  return new Intl.NumberFormat("pt-BR").format(count)
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    console.warn("[viral-cron] Unauthorized request")
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const startedAt = Date.now()

  if (!isPushConfigured()) {
    return NextResponse.json(
      { skipped: "push not configured", durationMs: Date.now() - startedAt },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    )
  }

  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)

    const candidates = (await prisma.postLog.findMany({
      where: {
        status: "success",
        mediaId: { not: null },
        viralNotifiedAt: null,
        createdAt: { gte: since },
        post: { publicationType: "post" },
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
        post: { select: { caption: true, userId: true } },
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
      take: MAX_LOGS_PER_RUN,
    })) as ViralCandidate[]

    if (candidates.length === 0) {
      return NextResponse.json(
        { checked: 0, notified: 0, durationMs: Date.now() - startedAt },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      )
    }

    const userIdByLogId = new Map(
      candidates.map((log) => [log.id, log.post.userId])
    )

    const now = Date.now()
    // Reaproveita a mesma checagem de cache da tela de Performance: se o
    // dado já é recente (por exemplo, o usuário abriu a tela há pouco), não
    // gasta outra chamada à Meta só porque o cron passou.
    const freshLogs = candidates.filter((log) => isCacheFresh(log, now))
    const staleLogs = candidates.filter((log) => !isCacheFresh(log, now))

    const results: PerformanceResult[] = freshLogs.map((log) =>
      cachedResult(log, now)
    )

    if (staleLogs.length > 0) {
      results.push(...(await refreshPerformanceLogs(staleLogs, now)))
    }

    const viral = results.filter(
      (result) => result.viewsCount !== null && result.viewsCount >= VIRAL_VIEWS_THRESHOLD
    )

    let notified = 0
    for (const result of viral) {
      const userId = userIdByLogId.get(result.id)
      if (!userId) continue

      try {
        await sendPushToUser(userId, {
          title: "🔥 Vídeo bombando!",
          body: `@${result.username} passou de ${formatViews(VIRAL_VIEWS_THRESHOLD)} visualizações (${formatViews(result.viewsCount as number)}).`,
          url: result.permalink || "/dashboard/performance",
          tag: `viral-${result.id}`,
        })
        notified += 1
      } catch (error) {
        console.error("[viral-cron] Falha ao enviar push", { logId: result.id, error })
      }

      // Marca como notificado mesmo se o push falhar (ex.: usuário sem
      // inscrição ativa): sem isso o cron tentaria de novo a cada execução
      // para sempre, e o vídeo já é sabidamente viral.
      await prisma.postLog.update({
        where: { id: result.id },
        data: { viralNotifiedAt: new Date() },
      })
    }

    const response = {
      checked: candidates.length,
      refreshed: staleLogs.length,
      viral: viral.length,
      notified,
      durationMs: Date.now() - startedAt,
    }

    console.info("[viral-cron] Checagem concluída", response)

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Não foi possível checar vídeos virais."

    console.error("[viral-cron] Falhou", error)

    return NextResponse.json(
      { error: message, durationMs: Date.now() - startedAt },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    )
  }
}

export async function GET(request: Request) {
  return POST(request)
}
