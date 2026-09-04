import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  fetchLiveStoryMedia,
  fetchStoryViews,
  refreshAccessTokenIfNeeded,
  refreshStoryPerformance,
  storyExpiresAt,
  type StoryLog,
} from "@/lib/instagram-performance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

// Guarda por 48h: um story expira em 24h, e mais 24h de graça pra quem ainda
// não abriu essa tela ver o último número antes dele sumir da lista.
const VISIBILITY_WINDOW_MS = 48 * 60 * 60 * 1000
const CACHE_TTL_MS = 10 * 60 * 1000

type StoryOut = {
  id: string
  username: string
  profilePicture: string | null
  viewsCount: number | null
  viewsMetric: string | null
  publishedAt: string | Date
  expiresAt: Date
  expired: boolean
  error: string | null
}

type LiveStoryWorking = StoryOut & { accountId: string }

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const shouldRefresh = new URL(request.url).searchParams.get("refresh") === "1"
  const since = new Date(Date.now() - VISIBILITY_WINDOW_MS)
  const now = Date.now()

  // 1) O que o InstaFlow já sabe (publicado por aqui, dentro da janela de
  // visibilidade — inclui os já expirados, para mostrar o último número).
  const trackedLogs = (await prisma.postLog.findMany({
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

  const trackedMediaIds = new Set(
    trackedLogs.map((log) => log.mediaId).filter((id): id is string => Boolean(id))
  )

  // 2) O que está no ar agora nas contas do usuário, não importa como foi
  // postado — inclui stories feitos direto pelo celular, que o InstaFlow
  // nunca teria como saber que existem de outro jeito.
  const usableAccounts = await prisma.instagramAccount.findMany({
    where: {
      userId: session.user.id,
      connectionType: "official",
      isActive: true,
      accessToken: { not: null },
      appConfigId: { not: null },
      tokenExpiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      igUserId: true,
      username: true,
      profilePicture: true,
      accessToken: true,
      tokenExpiresAt: true,
    },
  })

  const liveExtra: LiveStoryWorking[] = []

  if (shouldRefresh && usableAccounts.length > 0) {
    await Promise.all(
      usableAccounts.map(async (account) => {
        try {
          const token = await refreshAccessTokenIfNeeded({
            id: account.id,
            accessToken: account.accessToken,
            tokenExpiresAt: account.tokenExpiresAt,
          })
          const liveStories = await fetchLiveStoryMedia(account.igUserId, token, account.id)

          for (const story of liveStories) {
            if (trackedMediaIds.has(story.id)) continue // já coberto pelo rastreamento próprio

            const publishedAt = story.timestamp ? new Date(story.timestamp) : new Date()
            liveExtra.push({
              id: `live-${story.id}`,
              accountId: account.id,
              username: account.username,
              profilePicture: account.profilePicture,
              viewsCount: null,
              viewsMetric: null,
              publishedAt,
              expiresAt: storyExpiresAt(publishedAt),
              expired: false,
              error: null,
            })
          }
        } catch {
          // uma conta com problema pontual não pode derrubar a tela toda
        }
      })
    )
  }

  const toResultShape = (log: StoryLog): StoryOut => ({
    id: log.id,
    username: log.instagramAccount.username,
    profilePicture: log.instagramAccount.profilePicture,
    viewsCount: log.performanceViewsCount,
    viewsMetric: log.performanceViewsMetric,
    publishedAt: log.createdAt,
    expiresAt: storyExpiresAt(log.createdAt),
    expired: storyExpiresAt(log.createdAt).getTime() <= now,
    error: log.performanceError,
  })

  if (!shouldRefresh) {
    const cached = trackedLogs.map(toResultShape)
    return NextResponse.json(cached, { headers: { "Cache-Control": "private, no-store, max-age=0" } })
  }

  // Só vale a pena bater na Meta pelos rastreados que ainda estão no ar e
  // não foram atualizados há pouco — story expirado usa o último número já salvo.
  const toRefresh = trackedLogs.filter((log) => {
    const expired = storyExpiresAt(log.createdAt).getTime() <= now
    const fresh = log.performanceUpdatedAt && now - log.performanceUpdatedAt.getTime() < CACHE_TTL_MS
    return !expired && !fresh
  })
  const skip = trackedLogs.filter((log) => !toRefresh.includes(log))

  const refreshed = toRefresh.length > 0 ? await refreshStoryPerformance(toRefresh, now) : []
  const cachedTracked = skip.map(toResultShape)

  // Views dos stories "só ao vivo" (postados na mão), agora que sabemos os IDs.
  const liveWithViews: StoryOut[] = await Promise.all(
    liveExtra.map(async (story): Promise<StoryOut> => {
      const { accountId, ...publicShape } = story
      const account = usableAccounts.find((a) => a.id === accountId)
      if (!account) return publicShape

      try {
        const token = await refreshAccessTokenIfNeeded({
          id: account.id,
          accessToken: account.accessToken,
          tokenExpiresAt: account.tokenExpiresAt,
        })
        const mediaId = publicShape.id.replace(/^live-/, "")
        const views = await fetchStoryViews(mediaId, token, account.id)
        return { ...publicShape, viewsCount: views.value, viewsMetric: views.metric }
      } catch (error) {
        return {
          ...publicShape,
          error: error instanceof Error ? error.message : "Erro ao buscar visualizações",
        }
      }
    })
  )

  const byId = new Map(trackedLogs.map((log, index) => [log.id, index]))
  const combinedTracked = [...refreshed, ...cachedTracked].sort(
    (a, b) => (byId.get(a.id) ?? 0) - (byId.get(b.id) ?? 0)
  )

  const combined = [...combinedTracked, ...liveWithViews].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  )

  return NextResponse.json(combined, { headers: { "Cache-Control": "private, no-store, max-age=0" } })
}
