"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  ExternalLink,
  Heart,
  Instagram,
  MessageCircle,
  Play,
  RefreshCw,
  Star,
  TrendingUp,
} from "lucide-react"
import toast from "react-hot-toast"

type PerformancePost = {
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
  publishedAt: string
  error: string | null
  performanceUpdatedAt: string | null
  stale: boolean
}

type PeriodKey = "today" | "yesterday" | "month" | "total"
type SortKey = "recent" | "views" | "likes" | "comments"

type PeriodOption = {
  value: PeriodKey
  label: string
  description: string
}

const numberFormatter = new Intl.NumberFormat("pt-BR")

const PERIOD_OPTIONS: PeriodOption[] = [
  { value: "today", label: "Hoje", description: "Publicações de hoje" },
  { value: "yesterday", label: "Ontem", description: "Publicações de ontem" },
  { value: "month", label: "Este mês", description: "Publicações do mês atual" },
  { value: "total", label: "Total", description: "Todas as publicações" },
]

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "recent", label: "Mais recentes" },
  { value: "views", label: "Mais visualizações" },
  { value: "likes", label: "Mais curtidas" },
  { value: "comments", label: "Mais comentários" },
]

function formatNumber(value: number | null) {
  return value === null ? "—" : numberFormatter.format(value)
}

function mediaLabel(post: PerformancePost) {
  if (post.mediaProductType === "REELS") return "Reel"
  if (post.mediaType === "VIDEO") return "Vídeo"
  if (post.mediaType === "CAROUSEL_ALBUM") return "Carrossel"
  if (post.mediaType === "IMAGE") return "Imagem"
  return "Publicação"
}

function getPeriodRange(period: PeriodKey) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (period === "today") {
    return {
      from: today,
      to: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1),
    }
  }

  if (period === "yesterday") {
    return {
      from: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1),
      to: today,
    }
  }

  if (period === "month") {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    }
  }

  return null
}

function getPerformanceUrl(
  period: PeriodKey,
  options: { refresh?: boolean; force?: boolean } = {}
) {
  const range = getPeriodRange(period)
  const params = new URLSearchParams()

  if (range) {
    params.set("from", range.from.toISOString())
    params.set("to", range.to.toISOString())
  }

  if (options.refresh) params.set("refresh", "1")
  if (options.force) params.set("force", "1")

  const query = params.toString()
  return query ? `/api/posts/performance?${query}` : "/api/posts/performance"
}

export default function PerformancePage() {
  const [posts, setPosts] = useState<PerformancePost[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>("today")
  const [sortBy, setSortBy] = useState<SortKey>("recent")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [pageError, setPageError] = useState("")
  const requestVersionRef = useRef(0)
  const requestControllerRef = useRef<AbortController | null>(null)

  async function fetchPerformance(
    period: PeriodKey,
    options: { refresh?: boolean; force?: boolean; signal: AbortSignal }
  ) {
    const response = await fetch(getPerformanceUrl(period, options), {
      cache: "no-store",
      signal: options.signal,
    })
    const payload = await response.json()

    if (!response.ok) {
      throw new Error(payload?.error || "Não foi possível carregar as métricas.")
    }

    if (!Array.isArray(payload)) {
      throw new Error("A API retornou uma resposta inválida.")
    }

    return payload as PerformancePost[]
  }

  async function loadPerformance(period: PeriodKey) {
    const version = requestVersionRef.current + 1
    requestVersionRef.current = version
    requestControllerRef.current?.abort()
    toast.dismiss("performance-refresh")

    const controller = new AbortController()
    requestControllerRef.current = controller
    setLoading(true)
    setRefreshing(false)
    setPageError("")

    try {
      const cachedPosts = await fetchPerformance(period, {
        signal: controller.signal,
      })

      if (requestVersionRef.current !== version) return

      setPosts(cachedPosts)
      setLoading(false)

      if (!cachedPosts.some((post) => post.stale)) return

      setRefreshing(true)
      toast.loading("Atualizando as métricas oficiais...", { id: "performance-refresh" })

      try {
        const refreshedPosts = await fetchPerformance(period, {
          refresh: true,
          signal: controller.signal,
        })

        if (requestVersionRef.current !== version) return
        setPosts(refreshedPosts)
        setPageError("")
        toast.success("Métricas atualizadas.", { id: "performance-refresh" })
      } catch (error) {
        if (controller.signal.aborted) {
          toast.dismiss("performance-refresh")
          return
        }
        const message =
          error instanceof Error
            ? error.message
            : "Não foi possível atualizar as métricas."
        setPageError(message)
        toast.error(message, { id: "performance-refresh" })
      } finally {
        if (requestVersionRef.current === version) {
          setRefreshing(false)
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return
      if (requestVersionRef.current !== version) return

      setPosts([])
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível carregar as métricas."
      setPageError(message)
      toast.error(message, { id: "performance-load-error" })
      setLoading(false)
    }
  }

  async function forceRefresh() {
    const version = requestVersionRef.current + 1
    requestVersionRef.current = version
    requestControllerRef.current?.abort()

    const controller = new AbortController()
    requestControllerRef.current = controller
    setRefreshing(true)
    setPageError("")
    toast.loading("Atualizando as métricas oficiais...", { id: "performance-refresh" })

    try {
      const refreshedPosts = await fetchPerformance(selectedPeriod, {
        refresh: true,
        force: true,
        signal: controller.signal,
      })

      if (requestVersionRef.current !== version) return
      setPosts(refreshedPosts)
      toast.success("Métricas atualizadas.", { id: "performance-refresh" })
    } catch (error) {
      if (controller.signal.aborted) {
        toast.dismiss("performance-refresh")
        return
      }
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar as métricas."
      setPageError(message)
      toast.error(message, { id: "performance-refresh" })
    } finally {
      if (requestVersionRef.current === version) {
        setRefreshing(false)
      }
    }
  }

  useEffect(() => {
    void loadPerformance(selectedPeriod)

    return () => {
      requestControllerRef.current?.abort()
    }
  }, [selectedPeriod])

  const [storiesSummary, setStoriesSummary] = useState<{
    totalViews: number
    storiesCount: number
    storiesWithData: number
  } | null>(null)
  const [storiesLoading, setStoriesLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setStoriesLoading(true)

    const range = getPeriodRange(selectedPeriod)
    const params = new URLSearchParams()
    if (range) {
      params.set("from", range.from.toISOString())
      params.set("to", range.to.toISOString())
    }
    const query = params.toString()

    fetch(`/api/posts/stories-performance/summary${query ? `?${query}` : ""}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return
        setStoriesSummary({
          totalViews: typeof data.totalViews === "number" ? data.totalViews : 0,
          storiesCount: typeof data.storiesCount === "number" ? data.storiesCount : 0,
          storiesWithData: typeof data.storiesWithData === "number" ? data.storiesWithData : 0,
        })
      })
      .catch(() => {
        if (!cancelled) setStoriesSummary(null)
      })
      .finally(() => {
        if (!cancelled) setStoriesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedPeriod])

  const selectedPeriodOption =
    PERIOD_OPTIONS.find((option) => option.value === selectedPeriod) ||
    PERIOD_OPTIONS[0]

  const totals = useMemo(
    () =>
      posts.reduce(
        (summary, post) => ({
          likes: summary.likes + (post.likeCount ?? 0),
          comments: summary.comments + (post.commentsCount ?? 0),
          views: summary.views + (post.viewsCount ?? 0),
        }),
        { likes: 0, comments: 0, views: 0 }
      ),
    [posts]
  )

  const hasMetrics = useMemo(
    () => posts.some((post) => Boolean(post.performanceUpdatedAt && !post.error)),
    [posts]
  )

  const sortedPosts = useMemo(() => {
    const metricValue = (post: PerformancePost) => {
      if (sortBy === "views") return post.viewsCount ?? -1
      if (sortBy === "likes") return post.likeCount ?? -1
      if (sortBy === "comments") return post.commentsCount ?? -1
      return new Date(post.publishedAt).getTime()
    }

    return [...posts].sort((a, b) => {
      const difference = metricValue(b) - metricValue(a)
      if (difference !== 0) return difference

      return (
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      )
    })
  }, [posts, sortBy])

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden">
      <div className="mb-6 flex min-w-0 flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Performance</h1>
          <p className="mt-1 text-gray-500">
            Métricas oficiais dos posts publicados pelo sistema
          </p>
          <p className="mt-1 text-xs text-purple-300/80">
            {selectedPeriodOption.description}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div
            role="tablist"
            aria-label="Período da performance"
            className="inline-flex rounded-xl border border-white/[0.07] bg-[#111] p-1"
          >
            {PERIOD_OPTIONS.map((option) => {
              const active = option.value === selectedPeriod
              return (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedPeriod(option.value)}
                  className={`rounded-lg px-3.5 py-2 text-xs font-medium transition ${
                    active
                      ? "bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/30"
                      : "text-gray-500 hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>

          <label className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.07] bg-[#111] px-3 text-xs text-gray-500">
            <span className="whitespace-nowrap">Ordenar por</span>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortKey)}
              aria-label="Ordenar publicações por"
              className="min-w-0 cursor-pointer bg-transparent font-medium text-gray-200 outline-none"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="bg-[#111]">
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => void forceRefresh()}
            disabled={loading || refreshing}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-xs font-medium text-gray-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              className={loading || refreshing ? "animate-spin" : ""}
            />
            {refreshing ? "Atualizando" : "Atualizar"}
          </button>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-white/5 bg-[#111] p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">
              Posts analisados
            </span>
            <TrendingUp size={14} className="text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-white">
            {loading ? "..." : numberFormatter.format(posts.length)}
          </p>
        </div>

        <div className="rounded-xl border border-white/5 bg-[#111] p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">
              Total de curtidas
            </span>
            <Heart size={14} className="text-pink-400" />
          </div>
          <p className="text-2xl font-bold text-white">
            {loading || (refreshing && !hasMetrics)
              ? "..."
              : numberFormatter.format(totals.likes)}
          </p>
        </div>

        <div className="rounded-xl border border-white/5 bg-[#111] p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">
              Total de comentários
            </span>
            <MessageCircle size={14} className="text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white">
            {loading || (refreshing && !hasMetrics)
              ? "..."
              : numberFormatter.format(totals.comments)}
          </p>
        </div>

        <div className="rounded-xl border border-white/5 bg-[#111] p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">
              Total de visualizações
            </span>
            <Play size={14} className="text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-white">
            {loading || (refreshing && !hasMetrics)
              ? "..."
              : numberFormatter.format(totals.views)}
          </p>
        </div>

        <div className="rounded-xl border border-white/5 bg-[#111] p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">
              Views nos stories
            </span>
            <Star size={14} className="text-yellow-400" />
          </div>
          <p className="text-2xl font-bold text-white">
            {storiesLoading || !storiesSummary
              ? "..."
              : storiesSummary.storiesCount === 0
                ? "—"
                : numberFormatter.format(storiesSummary.totalViews)}
          </p>
          {!storiesLoading && storiesSummary && storiesSummary.storiesCount > 0 && storiesSummary.storiesWithData === 0 && (
            <p className="mt-1 text-[11px] text-yellow-300">
              Abra Stories e atualize para buscar as views
            </p>
          )}
          {!storiesLoading &&
            storiesSummary &&
            storiesSummary.storiesWithData > 0 &&
            storiesSummary.storiesWithData < storiesSummary.storiesCount && (
              <p className="mt-1 text-[11px] text-gray-600">
                {storiesSummary.storiesWithData} de {storiesSummary.storiesCount} com dado
              </p>
            )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
        </div>
      )}

      {!loading && !pageError && posts.length === 0 && (
        <div className="rounded-xl border border-white/5 bg-[#111] p-16 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-500/10">
            <TrendingUp size={24} className="text-purple-400" />
          </div>
          <h3 className="mb-2 font-semibold text-white">
            Nenhuma publicação neste período
          </h3>
          <p className="mx-auto max-w-sm text-sm text-gray-500">
            Selecione outro período ou publique novos conteúdos para acompanhar as
            métricas aqui.
          </p>
        </div>
      )}

      {!loading && posts.length > 0 && (
        <div className="space-y-3">
          {sortedPosts.map((post) => (
            <div
              key={post.id}
              className="flex w-full min-w-0 max-w-full flex-col gap-4 overflow-hidden rounded-xl border border-white/5 bg-[#111] p-5 lg:flex-row lg:items-center"
            >
              <div className="flex w-full min-w-0 flex-1 items-center gap-4 lg:w-0">
                {post.profilePicture ? (
                  <img
                    src={post.profilePicture}
                    alt={`Foto de @${post.username}`}
                    className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500">
                    <Instagram size={16} className="text-white" />
                  </div>
                )}

                <div className="w-0 min-w-0 flex-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">
                      @{post.username}
                    </p>
                    <span className="rounded-full border border-white/5 bg-white/[0.03] px-2 py-0.5 text-[10px] text-gray-500">
                      {mediaLabel(post)}
                    </span>
                  </div>
                  <p
                    className="mt-0.5 block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs text-gray-500"
                    title={post.caption || "Sem legenda"}
                  >
                    {post.caption || "Sem legenda"}
                  </p>
                </div>
              </div>

              {post.error ? (
                <span className="max-w-md text-xs text-red-400">
                  {post.error}
                </span>
              ) : (
                <div className="flex flex-wrap items-center gap-4 lg:flex-shrink-0">
                  <div className="flex items-center gap-1.5 text-sm text-gray-300">
                    <Heart size={14} className="text-pink-400" />
                    {formatNumber(post.likeCount)}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-gray-300">
                    <MessageCircle size={14} className="text-blue-400" />
                    {formatNumber(post.commentsCount)}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-gray-300">
                    <Play size={14} className="text-purple-400" />
                    {formatNumber(post.viewsCount)}
                  </div>
                  {post.permalink && (
                    <a
                      href={post.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Abrir publicação no Instagram"
                      className="text-gray-500 transition hover:text-white"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              )}

              <span className="text-xs text-gray-600 lg:flex-shrink-0">
                {new Date(post.publishedAt).toLocaleDateString("pt-BR")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
