import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  fetchLiveStoryMedia,
  fetchStoryViews,
  refreshAccessTokenIfNeeded,
} from "@/lib/instagram-performance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function parseDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function inRange(date: Date, from: Date | null, to: Date | null) {
  if (from && date.getTime() < from.getTime()) return false
  if (to && date.getTime() >= to.getTime()) return false
  return true
}

// Mesma fonte de dado que a tela de Stories: o que o InstaFlow já rastreou
// (salvo no banco) MAIS o que está ao vivo agora em cada conta, não importa
// como foi postado. Sem essa segunda parte, um story feito direto pelo
// celular nunca entraria nesta soma.
export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const requestUrl = new URL(request.url)
  const from = parseDate(requestUrl.searchParams.get("from"))
  const to = parseDate(requestUrl.searchParams.get("to"))

  const createdAt =
    from || to
      ? { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) }
      : undefined

  const trackedLogs = await prisma.postLog.findMany({
    where: {
      status: "success",
      mediaId: { not: null },
      ...(createdAt ? { createdAt } : {}),
      post: { userId: session.user.id, publicationType: "story" },
    },
    select: { mediaId: true, performanceViewsCount: true },
  })

  const trackedMediaIds = new Set(
    trackedLogs.map((log) => log.mediaId).filter((id): id is string => Boolean(id))
  )

  // Descobre o que está ao vivo agora, do mesmo jeito que a tela de Stories
  // — um story ativo é sempre "de agora", então só interessa quando o
  // período pedido cobre o presente (ex.: hoje, este mês, total).
  const includesNow = inRange(new Date(), from, to)
  let liveExtra: { viewsCount: number | null }[] = []

  if (includesNow) {
    const usableAccounts = await prisma.instagramAccount.findMany({
      where: {
        userId: session.user.id,
        connectionType: "official",
        isActive: true,
        accessToken: { not: null },
        appConfigId: { not: null },
        tokenExpiresAt: { gt: new Date() },
      },
      select: { id: true, igUserId: true, accessToken: true, tokenExpiresAt: true },
    })

    const results = await Promise.all(
      usableAccounts.map(async (account) => {
        try {
          const token = await refreshAccessTokenIfNeeded({
            id: account.id,
            accessToken: account.accessToken,
            tokenExpiresAt: account.tokenExpiresAt,
          })
          const liveStories = await fetchLiveStoryMedia(account.igUserId, token, account.id)

          const fresh = liveStories.filter((story) => !trackedMediaIds.has(story.id))
          return await Promise.all(
            fresh.map(async (story) => {
              try {
                const views = await fetchStoryViews(story.id, token, account.id)
                return { viewsCount: views.value }
              } catch {
                return { viewsCount: null }
              }
            })
          )
        } catch {
          return []
        }
      })
    )

    liveExtra = results.flat()
  }

  const trackedWithData = trackedLogs.filter((log) => log.performanceViewsCount !== null)
  const liveWithData = liveExtra.filter((story) => story.viewsCount !== null)

  const totalViews =
    trackedWithData.reduce((sum, log) => sum + (log.performanceViewsCount || 0), 0) +
    liveWithData.reduce((sum, story) => sum + (story.viewsCount || 0), 0)

  return NextResponse.json(
    {
      storiesCount: trackedLogs.length + liveExtra.length,
      storiesWithData: trackedWithData.length + liveWithData.length,
      totalViews,
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  )
}
