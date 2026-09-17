import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { refreshStoryPerformance, type StoryLog } from "@/lib/instagram-performance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 280

// Sem isso, a view de um story só era atualizada quando alguém abria a tela
// de Stories/Performance e clicava em Atualizar — a maioria ficava com o
// número de logo depois de postar (bem menor que o real) e congelava assim
// pra sempre assim que o story expirava em 24h.
const REFRESH_INTERVAL_MS = 20 * 60 * 1000
const MAX_LOGS_PER_RUN = 80
const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000

function authorized(request: Request) {
  const secret = process.env.QUEUE_CRON_SECRET?.trim()
  if (!secret) return false

  const authorization = request.headers.get("authorization")?.trim()
  const headerSecret = request.headers.get("x-cron-secret")?.trim()

  return authorization === `Bearer ${secret}` || headerSecret === secret
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    console.warn("[refresh-stories] Unauthorized request")
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const startedAt = Date.now()
  const now = Date.now()
  const staleCutoff = new Date(now - REFRESH_INTERVAL_MS)
  const notExpiredSince = new Date(now - STORY_LIFETIME_MS)

  try {
    const candidates = (await prisma.postLog.findMany({
      where: {
        status: "success",
        mediaId: { not: null },
        instagramAccountId: { not: null },
        createdAt: { gte: notExpiredSince },
        post: { publicationType: "story" },
        OR: [{ performanceUpdatedAt: null }, { performanceUpdatedAt: { lt: staleCutoff } }],
      },
      select: {
        id: true,
        mediaId: true,
        createdAt: true,
        performanceViewsCount: true,
        performanceViewsMetric: true,
        performanceUpdatedAt: true,
        performanceError: true,
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
      orderBy: { createdAt: "asc" },
      take: MAX_LOGS_PER_RUN,
    })) as StoryLog[]

    const results = candidates.length > 0 ? await refreshStoryPerformance(candidates, now) : []

    const response = {
      checked: candidates.length,
      refreshed: results.length,
      durationMs: Date.now() - startedAt,
    }

    console.info("[refresh-stories] Checagem concluída", response)

    return NextResponse.json(response, { headers: { "Cache-Control": "no-store, max-age=0" } })
  } catch (error) {
    console.error("[refresh-stories] Falhou", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erro ao atualizar performance de stories.",
        durationMs: Date.now() - startedAt,
      },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  return POST(request)
}
