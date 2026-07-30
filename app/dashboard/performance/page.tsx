"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ExternalLink,
  Heart,
  Instagram,
  MessageCircle,
  Play,
  RefreshCw,
  TrendingUp,
} from "lucide-react"

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
}

type PeriodKey = "today" | "yesterday" | "month" | "total"

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

function getPerformanceUrl(period: PeriodKey) {
  const range = getPeriodRange(period)
  if (!range) return "/api/posts/performance"

  const params = new URLSearchParams({
    from: range.from.toISOString(),
    to: range.to.toISOString(),
  })

  return `/api/posts/performance?${params.toString()}`
}

export default function PerformancePage() {
  const [posts, setPosts] = useState<PerformancePost[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>("today")
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState("")

  async function loadPerformance(period: PeriodKey) {
    setLoading(true)
    setPageError("")

    try {
      const response = await fetch(getPerformanceUrl(period), {
        cache: "no-store",
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload?.error || "Não foi possível carregar as métricas.")
      }

      if (!Array.isArray(payload)) {
        throw new Error("A API retornou uma resposta inválida.")
      }

      setPosts(payload)
    } catch (error) {
      setPosts([])
      setPageError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar as métricas."
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPerformance(selectedPeriod)
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

  return (
    <div>
      <div className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
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

          <button
            type="button"
            onClick={() => void loadPerformance(selectedPeriod)}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-xs font-medium text-gray-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Atualizar
          </button>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
            {loading ? "..." : numberFormatter.format(totals.likes)}
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
            {loading ? "..." : numberFormatter.format(totals.comments)}
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
            {loading ? "..." : numberFormatter.format(totals.views)}
          </p>
        </div>
      </div>

      {pageError && (
        <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {pageError}
        </div>
      )}

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
          {posts.map((post) => (
            <div
              key={post.id}
              className="flex flex-col gap-4 rounded-xl border border-white/5 bg-[#111] p-5 lg:flex-row lg:items-center"
            >
              <div className="flex min-w-0 flex-1 items-center gap-4">
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

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">
                      @{post.username}
                    </p>
                    <span className="rounded-full border border-white/5 bg-white/[0.03] px-2 py-0.5 text-[10px] text-gray-500">
                      {mediaLabel(post)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
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
