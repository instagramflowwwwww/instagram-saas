import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { refreshStoryPerformance, storyExpiresAt, type StoryLog } from "@/lib/instagram-performance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

// Guarda por 48h: um story expira em 24h, e mais 24h de graça pra quem ainda
// não abriu essa tela ver o último número antes dele sumir da lista.
const VISIBILITY_WINDOW_MS = 48 * 60 * 60 * 1000
const CACHE_TTL_MS = 10 * 60 * 1000

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const shouldRefresh = new URL(request.url).searchParams.get("refresh") === "1"
  const since = new Date(Date.now() - VISIBILITY_WINDOW_MS)

  const logs = (await prisma.postLog.findMany({
    where: {
      status: "success",
      mediaId: { not: null },
      createdAt: { gte: since },
      post: { userId: session.user.id, publicationType: "story" },
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
    orderBy: { createdAt: "desc" },
  })) as StoryLog[]

  if (logs.length === 0) {
    return NextResponse.json([], { headers: { "Cache-Control": "private, no-store, max-age=0" } })
  }

  const now = Date.now()

  if (!shouldRefresh) {
    const cached = logs.map((log) => ({
      id: log.id,
      username: log.instagramAccount.username,
      profilePicture: log.instagramAccount.profilePicture,
      viewsCount: log.performanceViewsCount,
      viewsMetric: log.performanceViewsMetric,
      publishedAt: log.createdAt,
      expiresAt: storyExpiresAt(log.createdAt),
      expired: storyExpiresAt(log.createdAt).getTime() <= now,
      error: log.performanceError,
      performanceUpdatedAt: log.performanceUpdatedAt,
    }))
    return NextResponse.json(cached, { headers: { "Cache-Control": "private, no-store, max-age=0" } })
  }

  // Só vale a pena bater na Meta por quem ainda está no ar e não foi
  // atualizado há pouco — story expirado usa o último número já salvo.
  const toRefresh = logs.filter((log) => {
    const expired = storyExpiresAt(log.createdAt).getTime() <= now
    const fresh = log.performanceUpdatedAt && now - log.performanceUpdatedAt.getTime() < CACHE_TTL_MS
    return !expired && !fresh
  })
  const skip = logs.filter((log) => !toRefresh.includes(log))

  const [refreshed, cached] = await Promise.all([
    toRefresh.length > 0 ? refreshStoryPerformance(toRefresh, now) : Promise.resolve([]),
    Promise.resolve(
      skip.map((log) => ({
        id: log.id,
        username: log.instagramAccount.username,
        profilePicture: log.instagramAccount.profilePicture,
        viewsCount: log.performanceViewsCount,
        viewsMetric: log.performanceViewsMetric,
        publishedAt: log.createdAt,
        expiresAt: storyExpiresAt(log.createdAt),
        expired: storyExpiresAt(log.createdAt).getTime() <= now,
        error: log.performanceError,
        performanceUpdatedAt: log.performanceUpdatedAt,
      }))
    ),
  ])

  const byId = new Map(logs.map((log, index) => [log.id, index]))
  const combined = [...refreshed, ...cached].sort(
    (a, b) => (byId.get(a.id) ?? 0) - (byId.get(b.id) ?? 0)
  )

  return NextResponse.json(combined, { headers: { "Cache-Control": "private, no-store, max-age=0" } })
}
