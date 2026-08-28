import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import {
  INSTAGRAM_OFFICIAL_CONNECTION,
  isInstagramDisconnectError,
  markInstagramAccountDisconnected,
} from "@/lib/instagram-account-lifecycle"
import {
  getMetaError,
  INSTAGRAM_GRAPH_VERSION,
  metaErrorMessage,
  readJsonResponse,
} from "@/lib/instagram-meta"
import { prisma } from "@/lib/prisma"
import { fetchInstagramRequest } from "@/lib/instagram-http"
import { decryptValue, encryptValue } from "@/lib/secure-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const GRAPH_BASE = `https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}`
const TOKEN_REFRESH_WINDOW = 7 * 24 * 60 * 60 * 1000
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000
const DEFAULT_ERROR_CACHE_TTL_MS = 60 * 1000
const DEFAULT_META_TIMEOUT_MS = 15_000
const MAX_CONCURRENCY = 8

const CACHE_TTL_MS = positiveNumber(
  process.env.PERFORMANCE_CACHE_TTL_MS,
  DEFAULT_CACHE_TTL_MS
)
const ERROR_CACHE_TTL_MS = positiveNumber(
  process.env.PERFORMANCE_ERROR_CACHE_TTL_MS,
  DEFAULT_ERROR_CACHE_TTL_MS
)
const META_TIMEOUT_MS = positiveNumber(
  process.env.PERFORMANCE_META_TIMEOUT_MS,
  DEFAULT_META_TIMEOUT_MS
)

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
  performancePermalink: string | null
  performanceLikeCount: number | null
  performanceCommentsCount: number | null
  performanceViewsCount: number | null
  performanceViewsMetric: string | null
  performanceMediaType: string | null
  performanceMediaProductType: string | null
  performancePublishedAt: Date | null
  performanceUpdatedAt: Date | null
  performanceError: string | null
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

type PerformanceResult = {
  id: string
  mediaId: string | null
  username: string
  profilePicture: string | null
  caption: string | null
  permalink: string | null
  likeCount: number | null
  commentsCount: number | null
  viewsCount: number | null
  viewsMetric: string | null
  mediaType: string | null
  mediaProductType: string | null
  publishedAt: Date | string
  error: string | null
  performanceUpdatedAt: Date | null
  stale: boolean
}

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
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

function isFatalMetaCode(code: number | undefined) {
  return code === 190 || code === 10 || code === 200
}

function isRateLimitCode(code: number | undefined) {
  return code === 4 || code === 17 || code === 32
}

function metaRequestInit(): RequestInit {
  return {
    cache: "no-store",
    signal: AbortSignal.timeout(META_TIMEOUT_MS),
  }
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return "A Meta demorou para responder. Tente atualizar novamente."
    }
    return error.message
  }

  return "Não foi possível carregar as métricas."
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

  const response = await fetchInstagramRequest(url, metaRequestInit())
  const { payload, raw } = await readJsonResponse(response)

  if (!response.ok || !payload?.access_token) {
    console.error("Instagram performance token refresh failed", {
      accountId: account.id,
      status: response.status,
      body: raw.slice(0, 1000),
    })
    const metaError = getMetaError(payload)
    if (metaError?.code === 190) {
      await markInstagramAccountDisconnected(account.id)
    }
    const error = new Error(
      metaError
        ? metaErrorMessage(metaError)
        : "Não foi possível renovar o acesso desta conta agora. Tente novamente."
    ) as Error & { metaCode?: number }
    error.metaCode = metaError?.code
    throw error
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
      connectionType: INSTAGRAM_OFFICIAL_CONNECTION,
      isActive: true,
      lastActiveAt: new Date(),
    },
  })

  return token
}

async function fetchMedia(
  mediaId: string,
  accessToken: string,
  accountId: string
) {
  const fieldSets = [
    "id,like_count,comments_count,media_type,media_product_type,permalink,timestamp",
    "id,like_count,comments_count,media_type,permalink,timestamp",
  ]

  let lastError = "Não foi possível carregar os dados da publicação."

  for (const fields of fieldSets) {
    const url = new URL(`${GRAPH_BASE}/${mediaId}`)
    url.searchParams.set("fields", fields)
    url.searchParams.set("access_token", accessToken)

    const response = await fetchInstagramRequest(url, metaRequestInit())
    const { payload } = await readJsonResponse(response)

    if (response.ok && payload) {
      return payload as InstagramMedia
    }

    const metaError = getMetaError(payload)
    lastError = metaErrorMessage(metaError)

    if (isFatalMetaCode(metaError?.code) || isRateLimitCode(metaError?.code)) {
      throw Object.assign(new Error(lastError), { metaCode: metaError?.code })
    }
  }

  throw new Error(lastError)
}

async function requestInsightMetric(
  mediaId: string,
  accessToken: string,
  metric: string,
  accountId: string,
  withMetricType: boolean
) {
  const url = new URL(`${GRAPH_BASE}/${mediaId}/insights`)
  url.searchParams.set("metric", metric)
  url.searchParams.set("access_token", accessToken)
  if (withMetricType) url.searchParams.set("metric_type", "total_value")

  const response = await fetchInstagramRequest(url, metaRequestInit())
  const { payload } = await readJsonResponse(response)

  if (response.ok && payload) {
    return {
      value: extractInsightValue(payload),
      error: null,
    }
  }

  const metaError = getMetaError(payload)
  return {
    value: null,
    error: Object.assign(new Error(metaErrorMessage(metaError)), {
      metaCode: metaError?.code,
    }) as Error & { metaCode?: number },
  }
}

async function fetchInsightMetric(
  mediaId: string,
  accessToken: string,
  metric: string,
  accountId: string
) {
  const primary = await requestInsightMetric(
    mediaId,
    accessToken,
    metric,
    accountId,
    true
  )

  if (!primary.error) return primary.value

  const primaryCode = primary.error.metaCode
  if (isFatalMetaCode(primaryCode) || isRateLimitCode(primaryCode)) {
    throw primary.error
  }

  const fallback = await requestInsightMetric(
    mediaId,
    accessToken,
    metric,
    accountId,
    false
  )

  if (!fallback.error) return fallback.value
  throw fallback.error
}

async function fetchViews(
  mediaId: string,
  accessToken: string,
  accountId: string
) {
  const metrics = ["views", "total_views"]

  for (const metric of metrics) {
    try {
      const value = await fetchInsightMetric(
        mediaId,
        accessToken,
        metric,
        accountId
      )
      if (value !== null) return { value, metric }
    } catch (error) {
      const metaCode = (error as Error & { metaCode?: number }).metaCode
      if (isFatalMetaCode(metaCode) || isRateLimitCode(metaCode)) {
        throw error
      }
    }
  }

  return { value: null, metric: null }
}

function cacheAgeLimit(log: PerformanceLog) {
  return log.performanceError ? ERROR_CACHE_TTL_MS : CACHE_TTL_MS
}

function isCacheFresh(log: PerformanceLog, now = Date.now()) {
  return Boolean(
    log.performanceUpdatedAt &&
      now - log.performanceUpdatedAt.getTime() < cacheAgeLimit(log)
  )
}

function cachedResult(log: PerformanceLog, now = Date.now()): PerformanceResult {
  return {
    id: log.id,
    mediaId: log.mediaId,
    username: log.instagramAccount.username,
    profilePicture: log.instagramAccount.profilePicture,
    caption: log.post.caption,
    permalink: log.performancePermalink,
    likeCount: log.performanceLikeCount,
    commentsCount: log.performanceCommentsCount,
    viewsCount: log.performanceViewsCount,
    viewsMetric: log.performanceViewsMetric,
    mediaType: log.performanceMediaType,
    mediaProductType: log.performanceMediaProductType,
    publishedAt: log.performancePublishedAt || log.createdAt,
    error: log.performanceError,
    performanceUpdatedAt: log.performanceUpdatedAt,
    stale: !isCacheFresh(log, now),
  }
}

async function savePerformanceResult(result: PerformanceResult) {
  await prisma.postLog.update({
    where: { id: result.id },
    data: {
      performancePermalink: result.permalink,
      performanceLikeCount: result.likeCount,
      performanceCommentsCount: result.commentsCount,
      performanceViewsCount: result.viewsCount,
      performanceViewsMetric: result.viewsMetric,
      performanceMediaType: result.mediaType,
      performanceMediaProductType: result.mediaProductType,
      performancePublishedAt: new Date(result.publishedAt),
      performanceUpdatedAt: result.performanceUpdatedAt,
      performanceError: result.error,
    },
  })
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

    const tokenPromises = new Map<string, Promise<string>>()

    const getAccessToken = (log: PerformanceLog) => {
      const accountId = log.instagramAccount.id
      const existing = tokenPromises.get(accountId)
      if (existing) return existing

      const promise = refreshAccessTokenIfNeeded({
        id: accountId,
        accessToken: log.instagramAccount.accessToken,
        tokenExpiresAt: log.instagramAccount.tokenExpiresAt,
      })
      tokenPromises.set(accountId, promise)
      return promise
    }

    const refreshedResults = await mapWithConcurrency(
      logsToRefresh,
      MAX_CONCURRENCY,
      async (log): Promise<PerformanceResult> => {
        const updatedAt = new Date()

        try {
          if (!log.mediaId) {
            throw new Error("Publicação sem ID oficial da Meta.")
          }

          const accessToken = await getAccessToken(log)
          const [media, views] = await Promise.all([
            fetchMedia(log.mediaId, accessToken, log.instagramAccount.id),
            fetchViews(log.mediaId, accessToken, log.instagramAccount.id),
          ])

          const result: PerformanceResult = {
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
            performanceUpdatedAt: updatedAt,
            stale: false,
          }

          await savePerformanceResult(result)
          return result
        } catch (error) {
          if (isInstagramDisconnectError(error)) {
            await markInstagramAccountDisconnected(log.instagramAccount.id)
          }

          const previous = cachedResult(log, now)

          if (log.performanceUpdatedAt && !log.performanceError) {
            return {
              ...previous,
              stale: true,
            }
          }

          const result: PerformanceResult = {
            ...previous,
            error: normalizeError(error),
            performanceUpdatedAt: updatedAt,
            stale: false,
          }

          await savePerformanceResult(result)
          return result
        }
      }
    )

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
