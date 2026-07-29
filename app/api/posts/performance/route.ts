import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import {
  getMetaError,
  INSTAGRAM_GRAPH_VERSION,
  metaErrorMessage,
  readJsonResponse,
} from "@/lib/instagram-meta"
import { prisma } from "@/lib/prisma"
import { decryptValue, encryptValue } from "@/lib/secure-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const GRAPH_BASE = `https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}`
const TOKEN_REFRESH_WINDOW = 7 * 24 * 60 * 60 * 1000
const MAX_CONCURRENCY = 5

type InstagramMedia = {
  id?: string
  media_type?: string
  media_product_type?: string
  permalink?: string
  timestamp?: string
  like_count?: number
  comments_count?: number
}

type InsightEntry = {
  name?: string
  values?: Array<{ value?: unknown }>
  total_value?: { value?: unknown }
}

type OfficialAccount = {
  id: string
  accessToken: string | null
  tokenExpiresAt: Date | null
}

type PerformanceLog = {
  id: string
  mediaId: string | null
  instagramAccountId: string
  createdAt: Date
  post: {
    caption: string | null
  }
  instagramAccount: {
    id: string
    username: string
    profilePicture: string | null
    accessToken: string | null
    tokenExpiresAt: Date | null
  }
}

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function extractInsightValue(payload: Record<string, any> | null) {
  const entry = Array.isArray(payload?.data)
    ? (payload.data[0] as InsightEntry | undefined)
    : undefined

  if (!entry) return null

  const totalValue = toNumber(entry.total_value?.value)
  if (totalValue !== null) return totalValue

  const values = Array.isArray(entry.values) ? entry.values : []
  if (values.length === 0) return null

  return values.reduce((sum, item) => {
    const value = toNumber(item?.value)
    return sum + (value ?? 0)
  }, 0)
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(items[index], index)
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => run()
    )
  )

  return results
}

async function refreshAccessTokenIfNeeded(account: OfficialAccount) {
  if (!account.accessToken) {
    throw new Error("Conta sem token oficial. Reconecte pelo App Meta.")
  }

  let token = decryptValue(account.accessToken)
  let expiresAt = account.tokenExpiresAt
  const needsRefresh =
    !expiresAt || expiresAt.getTime() - Date.now() <= TOKEN_REFRESH_WINDOW

  if (!needsRefresh) return token

  const url = new URL("https://graph.instagram.com/refresh_access_token")
  url.searchParams.set("grant_type", "ig_refresh_token")
  url.searchParams.set("access_token", token)

  const response = await fetch(url, { cache: "no-store" })
  const { payload, raw } = await readJsonResponse(response)

  if (!response.ok || !payload?.access_token) {
    console.error("Instagram performance token refresh failed", {
      accountId: account.id,
      status: response.status,
      body: raw.slice(0, 1000),
    })
    throw new Error(
      "O acesso desta conta expirou. Reconecte a conta pelo App Meta."
    )
  }

  token = String(payload.access_token)
  expiresAt = new Date(
    Date.now() + Number(payload.expires_in || 60 * 24 * 60 * 60) * 1000
  )

  await prisma.instagramAccount.update({
    where: { id: account.id },
    data: {
      accessToken: encryptValue(token),
      tokenExpiresAt: expiresAt,
      isActive: true,
      lastActiveAt: new Date(),
    },
  })

  return token
}

async function fetchMedia(mediaId: string, accessToken: string) {
  const fieldSets = [
    "id,like_count,comments_count,media_type,media_product_type,permalink,timestamp",
    "id,like_count,comments_count,media_type,permalink,timestamp",
  ]

  let lastError = "Não foi possível carregar os dados da publicação."

  for (const fields of fieldSets) {
    const url = new URL(`${GRAPH_BASE}/${mediaId}`)
    url.searchParams.set("fields", fields)
    url.searchParams.set("access_token", accessToken)

    const response = await fetch(url, { cache: "no-store" })
    const { payload } = await readJsonResponse(response)

    if (response.ok && payload) {
      return payload as InstagramMedia
    }

    lastError = metaErrorMessage(getMetaError(payload))
  }

  throw new Error(lastError)
}

async function fetchInsightMetric(
  mediaId: string,
  accessToken: string,
  metric: string
) {
  const variants = ["total_value", null] as const
  let lastError: (Error & { metaCode?: number }) | null = null

  for (const metricType of variants) {
    const url = new URL(`${GRAPH_BASE}/${mediaId}/insights`)
    url.searchParams.set("metric", metric)
    url.searchParams.set("access_token", accessToken)
    if (metricType) url.searchParams.set("metric_type", metricType)

    const response = await fetch(url, { cache: "no-store" })
    const { payload } = await readJsonResponse(response)

    if (response.ok && payload) {
      return extractInsightValue(payload)
    }

    const metaError = getMetaError(payload)
    lastError = new Error(metaErrorMessage(metaError)) as Error & {
      metaCode?: number
    }
    lastError.metaCode = metaError?.code
  }

  throw lastError || new Error("A Meta não retornou esta métrica.")
}

async function fetchViews(
  mediaId: string,
  accessToken: string,
  media: InstagramMedia
) {
  const mediaType = String(media.media_type || "").toUpperCase()
  const productType = String(media.media_product_type || "").toUpperCase()
  const metrics = ["views"]

  if (mediaType === "VIDEO" || productType === "REELS") {
    metrics.push("plays", "ig_reels_aggregated_all_plays_count")
  }

  for (const metric of metrics) {
    try {
      const value = await fetchInsightMetric(mediaId, accessToken, metric)
      if (value !== null) return { value, metric }
    } catch (error) {
      const metaCode = (error as Error & { metaCode?: number }).metaCode
      if (metaCode === 190 || metaCode === 10 || metaCode === 200) {
        throw error
      }
    }
  }

  return { value: null, metric: null }
}

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    const logs = (await prisma.postLog.findMany({
      where: {
        status: "success",
        mediaId: { not: null },
        post: { userId: session.user.id },
        instagramAccount: {
          connectionType: "official",
        },
      },
      include: {
        post: true,
        instagramAccount: true,
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    })) as PerformanceLog[]

    const seen = new Set<string>()
    const uniqueLogs = logs.filter((log) => {
      const key = `${log.instagramAccountId}:${log.mediaId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    const results = await mapWithConcurrency(
      uniqueLogs,
      MAX_CONCURRENCY,
      async (log) => {
        try {
          if (!log.mediaId) {
            throw new Error("Publicação sem ID oficial da Meta.")
          }

          const accessToken = await refreshAccessTokenIfNeeded({
            id: log.instagramAccount.id,
            accessToken: log.instagramAccount.accessToken,
            tokenExpiresAt: log.instagramAccount.tokenExpiresAt,
          })
          const media = await fetchMedia(log.mediaId, accessToken)
          const views = await fetchViews(log.mediaId, accessToken, media)

          return {
            id: log.id,
            mediaId: log.mediaId,
            username: log.instagramAccount.username,
            profilePicture: log.instagramAccount.profilePicture,
            caption: log.post.caption,
            permalink: media.permalink || null,
            likeCount: toNumber(media.like_count),
            commentsCount: toNumber(media.comments_count),
            viewsCount: views.value,
            viewsMetric: views.metric,
            mediaType: media.media_type || null,
            mediaProductType: media.media_product_type || null,
            publishedAt: media.timestamp || log.createdAt,
            error: null,
          }
        } catch (error) {
          return {
            id: log.id,
            mediaId: log.mediaId,
            username: log.instagramAccount.username,
            profilePicture: log.instagramAccount.profilePicture,
            caption: log.post.caption,
            permalink: null,
            likeCount: null,
            commentsCount: null,
            viewsCount: null,
            viewsMetric: null,
            mediaType: null,
            mediaProductType: null,
            publishedAt: log.createdAt,
            error:
              error instanceof Error
                ? error.message
                : "Não foi possível carregar as métricas.",
          }
        }
      }
    )

    return NextResponse.json(results, {
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
