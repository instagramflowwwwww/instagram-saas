"use client"

import { useSession } from "next-auth/react"
import Link from "next/link"
import {
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Eye,
  Instagram,
  ListChecks,
  Loader2,
  Minus,
  Crown,
  Medal,
  RefreshCw,
  Trophy,
  TrendingUp,
} from "lucide-react"
import {
  type ChangeEvent,
  type ElementType,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import toast from "react-hot-toast"
import { toastWarning } from "@/lib/toast"

type RankingEntry = {
  userId: string
  name: string
  image: string | null
  accountsCount: number
  viewsToday: number
  postsCount: number
  rank: number
  isYou: boolean
}

type RankingData = {
  updatedAt: string
  ranking: RankingEntry[]
  you: RankingEntry | null
}

type Metric = {
  value: number
  trend: number | null
}

type DashboardAccount = {
  id: string
  username: string
  name: string | null
  accountType: string | null
  profilePicture: string | null
  followerCount: number | null
  mediaCount: number | null
  isActive: boolean
  tokenExpiresAt: string | null
  lastActiveAt: string
  requiresReconnect: boolean
}

type RecentPost = {
  id: string
  caption: string
  kind: "Reel" | "Imagem"
  thumbnailUrl: string | null
  status: string
  createdAt: string
  publishedAt: string | null
  scheduledAt: string | null
  successCount: number
  errorCount: number
  errorMessage: string | null
  accounts: Array<{
    id: string
    username: string
    profilePicture: string | null
  }>
}

type UpcomingPost = {
  id: string
  caption: string
  kind: "Reel" | "Imagem"
  publicationType: string
  scheduledAt: string | null
  account: { id: string; username: string; profilePicture: string | null } | null
}

type DashboardData = {
  summary: {
    accounts: Metric & {
      totalConfigured: number
      newInPeriod: number
    }
    published: Metric
    scheduled: Metric
    failures: Metric
    queue: { value: number }
  }
  today: {
    views: number
    viewsTrend: number | null
    viewsTotal: number
    published: number
    publishedYesterday: number
  }
  audience: {
    totalFollowers: number
    totalMedia: number
    averageFollowers: number
  }
  accounts: DashboardAccount[]
  recentPosts: RecentPost[]
  upcomingPosts: UpcomingPost[]
  generatedAt: string
}

type StatCardProps = {
  label: string
  value: number
  description: string
  // null = "novo no período" (sem dado anterior pra comparar); undefined =
  // esse cartão não tem conceito de tendência (ex.: contagem instantânea da fila).
  trend?: number | null
  icon: ElementType
  iconClassName: string
  iconBackground: string
  inverseTrend?: boolean
}

function getToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function getInitialDateFrom() {
  const date = new Date()
  date.setDate(date.getDate() - 30)

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value)
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}

const RANK_STYLES: Record<number, { badge: string; icon: ElementType | null; glow: string }> = {
  1: {
    badge: "bg-gradient-to-br from-yellow-300 to-amber-500 text-amber-950 shadow-[0_0_16px_-2px_rgba(251,191,36,0.6)]",
    icon: Crown,
    glow: "border-amber-400/30 bg-gradient-to-r from-amber-500/[0.08] to-transparent",
  },
  2: {
    badge: "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900",
    icon: Medal,
    glow: "border-white/[0.07] bg-white/[0.02]",
  },
  3: {
    badge: "bg-gradient-to-br from-orange-300 to-orange-600 text-orange-950",
    icon: Medal,
    glow: "border-white/[0.07] bg-white/[0.02]",
  },
}

function rankStyle(rank: number) {
  return (
    RANK_STYLES[rank] || {
      badge: "bg-white/[0.05] border border-white/10 text-gray-400",
      icon: null,
      glow: "",
    }
  )
}

const AVATAR_GRADIENTS = [
  "from-purple-500 to-pink-500",
  "from-blue-500 to-cyan-400",
  "from-emerald-500 to-teal-400",
  "from-pink-500 to-rose-400",
  "from-indigo-500 to-purple-400",
  "from-amber-500 to-orange-400",
]

function avatarGradient(userId: string) {
  let hash = 0
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]
}

function formatDate(value: string | null) {
  if (!value) return "—"

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value))
}

function AccountAvatar({
  src,
  username,
  size = "md",
}: {
  src: string | null
  username: string
  size?: "sm" | "md"
}) {
  const [failed, setFailed] = useState(false)
  const classes = size === "sm" ? "h-7 w-7" : "h-11 w-11"

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={`Foto de @${username}`}
        className={`${classes} shrink-0 rounded-full border border-white/10 object-cover`}
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <div
      className={`${classes} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-white`}
    >
      <Instagram size={size === "sm" ? 13 : 18} />
    </div>
  )
}

function TrendBadge({
  value,
  inverse = false,
}: {
  value: number | null
  inverse?: boolean
}) {
  if (value === null) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-300">
        <TrendingUp size={12} />
        Novo no período
      </span>
    )
  }

  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
        <Minus size={12} />
        Sem alteração
      </span>
    )
  }

  const positive = value > 0
  const healthy = inverse ? !positive : positive
  const Icon = positive ? ArrowUpRight : ArrowDownRight

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium ${
        healthy ? "text-green-400" : "text-red-400"
      }`}
    >
      <Icon size={12} />
      {Math.abs(value)}% vs. período anterior
    </span>
  )
}

const STAT_CARD_TINTS: Record<string, [string, string]> = {
  pink: ["rgba(244,114,182,0.55)", "rgba(236,72,153,0.22)"],
  purple: ["rgba(192,132,252,0.55)", "rgba(168,85,247,0.22)"],
  green: ["rgba(134,239,172,0.5)", "rgba(74,222,128,0.2)"],
  amber: ["rgba(252,211,77,0.5)", "rgba(251,191,36,0.2)"],
  blue: ["rgba(125,211,252,0.5)", "rgba(56,189,248,0.2)"],
  red: ["rgba(252,165,165,0.5)", "rgba(248,113,113,0.2)"],
}

function statCardTint(iconClassName: string) {
  const match = iconClassName.match(/text-(\w+)-\d+/)
  const color = match ? STAT_CARD_TINTS[match[1]] : undefined
  return color || STAT_CARD_TINTS.purple
}

function StatCard({
  label,
  value,
  description,
  trend,
  icon: Icon,
  iconClassName,
  iconBackground,
  inverseTrend,
}: StatCardProps) {
  const [tintStrong, tintSoft] = statCardTint(iconClassName)

  return (
    <div
      className="h-full rounded-2xl p-px"
      style={{
        background: `linear-gradient(135deg, ${tintStrong}, rgba(255,255,255,0.04) 55%, ${tintSoft})`,
      }}
    >
      <div className="card-glow-border h-full rounded-[15px] bg-[#0d0d10] p-5 transition-colors">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-gray-500">{label}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-white">
              {formatNumber(value)}
            </p>
          </div>
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconBackground}`}
          >
            <Icon size={16} className={iconClassName} />
          </div>
        </div>
        <div className="flex min-h-8 flex-col gap-1">
          {trend !== undefined && <TrendBadge value={trend} inverse={inverseTrend} />}
          <p className="text-[11px] text-gray-600">{description}</p>
        </div>
      </div>
    </div>
  )
}

function RankingRow({ entry, detached = false }: { entry: RankingEntry; detached?: boolean }) {
  const style = rankStyle(entry.rank)
  const RankIcon = style.icon

  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg p-2 transition-colors ${
        entry.isYou
          ? "border border-purple-500/30 bg-purple-500/[0.08]"
          : detached
            ? "border border-white/[0.06] bg-white/[0.02]"
            : `border border-transparent ${style.glow}`
      }`}
    >
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${style.badge}`}
      >
        {RankIcon ? <RankIcon size={13} strokeWidth={2.4} /> : entry.rank}
      </div>

      {entry.image ? (
        <img
          src={entry.image}
          alt={entry.name}
          className="h-7 w-7 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-bold text-white ${avatarGradient(entry.userId)}`}
        >
          {entry.name.trim().charAt(0).toUpperCase() || "?"}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-xs font-semibold text-white">
          {entry.name}
          {entry.isYou && (
            <span className="rounded-full bg-purple-500/20 px-1.5 py-0.5 text-[9px] font-medium text-purple-300">
              VOCÊ
            </span>
          )}
        </p>
        <p className="mt-0.5 truncate text-[10px] text-gray-500">
          {entry.accountsCount} conta(s) · {formatNumber(entry.postsCount)} posts hoje
        </p>
      </div>

      <div className="shrink-0 rounded-md bg-yellow-500/10 px-2 py-1 text-right">
        <p className="text-xs font-bold leading-tight text-yellow-300">
          {formatNumber(entry.viewsToday)}
        </p>
        <p className="text-[8px] uppercase tracking-wide text-yellow-600/80">views</p>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [dateFrom, setDateFrom] = useState(getInitialDateFrom)
  const [dateTo, setDateTo] = useState(getToday)
  const [ranking, setRanking] = useState<RankingData | null>(null)
  const [rankingLoading, setRankingLoading] = useState(true)

  const loadDashboard = useCallback(
    async (syncAccounts = false) => {
      setRefreshing(syncAccounts)

      try {
        let accountSyncWarning = ""

        if (syncAccounts) {
          try {
            const accountResponse = await fetch("/api/instagram/accounts?sync=1", {
              cache: "no-store",
            })
            const accountPayload = await accountResponse.json().catch(() => ({}))
            if (!accountResponse.ok) {
              accountSyncWarning =
                accountPayload.error || "Não foi possível atualizar os dados das contas."
            }
          } catch (syncError) {
            accountSyncWarning =
              syncError instanceof Error
                ? syncError.message
                : "Não foi possível atualizar os dados das contas."
          }
        }

        const params = new URLSearchParams({
          from: dateFrom,
          to: dateTo,
        })
        const response = await fetch(`/api/dashboard/stats?${params}`, {
          cache: "no-store",
        })
        const payload = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(payload.error || "Não foi possível carregar o dashboard.")
        }

        setData(payload)
        if (syncAccounts) {
          if (accountSyncWarning) {
            toastWarning(`Dashboard atualizado, mas a sincronização das contas falhou: ${accountSyncWarning}`)
          } else {
            toast.success("Dashboard atualizado.")
          }
        }
      } catch (loadError) {
        toast.error(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar o dashboard.",
          { id: "dashboard-load-error" }
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [dateFrom, dateTo]
  )

  useEffect(() => {
    setLoading(true)
    void loadDashboard(false)
  }, [loadDashboard])

  const loadRanking = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard/ranking", { cache: "no-store" })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar o ranking.")
      setRanking(payload)
    } catch {
      // Ranking é informativo — uma falha aqui não deve atrapalhar o resto do dashboard.
    } finally {
      setRankingLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRanking()
  }, [loadRanking])

  const maxFollowers = useMemo(
    () =>
      Math.max(
        1,
        ...(data?.accounts.map((account) => account.followerCount || 0) || [0])
      ),
    [data?.accounts]
  )

  const firstName = session?.user?.name?.trim().split(" ")[0] || "usuário"
  const hasAccounts = Boolean(data?.accounts.length)

  return (
    <div className="relative space-y-6">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1100px 650px at 15% 0%, rgba(192,132,252,0.28), transparent 65%), radial-gradient(950px 600px at 88% 8%, rgba(236,72,153,0.22), transparent 62%), radial-gradient(700px 500px at 50% 100%, rgba(168,85,247,0.1), transparent 70%)",
        }}
      />
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Olá, {firstName} 👋</h1>
          <p className="mt-1 text-sm text-gray-500">
            Acompanhe suas contas, publicações e falhas em um só lugar.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#111] px-3 py-2.5">
            <Calendar size={14} className="shrink-0 text-gray-500" />
            <input
              type="date"
              value={dateFrom}
              max={dateTo}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setDateFrom(event.target.value)
              }
              className="min-w-0 bg-transparent text-xs text-gray-200 outline-none [color-scheme:dark]"
              aria-label="Data inicial"
            />
            <span className="text-xs text-gray-600">até</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              max={getToday()}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setDateTo(event.target.value)
              }
              className="min-w-0 bg-transparent text-xs text-gray-200 outline-none [color-scheme:dark]"
              aria-label="Data final"
            />
          </div>
          <button
            type="button"
            onClick={() => loadDashboard(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-medium text-gray-300 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              className={refreshing ? "animate-spin" : ""}
            />
            Atualizar dados
          </button>
        </div>
      </header>

      {loading && !data ? (
        <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-white/[0.06] bg-[#111]">
          <div className="text-center">
            <Loader2 size={24} className="mx-auto animate-spin text-purple-400" />
            <p className="mt-3 text-sm text-gray-500">Carregando dados reais...</p>
          </div>
        </div>
      ) : data ? (
        <>
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label="Visualizações hoje"
              value={data.today.views}
              description={`${formatCompactNumber(data.today.viewsTotal)} no total`}
              trend={data.today.viewsTrend}
              icon={Eye}
              iconClassName="text-pink-400"
              iconBackground="bg-pink-500/10"
            />
            <StatCard
              label="Contas conectadas"
              value={data.summary.accounts.value}
              description={`${data.summary.accounts.newInPeriod} nova(s) no período`}
              trend={data.summary.accounts.trend}
              icon={Instagram}
              iconClassName="text-purple-400"
              iconBackground="bg-purple-500/10"
            />
            <StatCard
              label="Posts publicados"
              value={data.summary.published.value}
              description={`${data.today.published} hoje · ${data.today.publishedYesterday} ontem`}
              trend={data.summary.published.trend}
              icon={CheckCircle2}
              iconClassName="text-green-400"
              iconBackground="bg-green-500/10"
            />
            <StatCard
              label="Posts na fila"
              value={data.summary.queue.value}
              description="Aguardando a vez de publicar"
              icon={ListChecks}
              iconClassName="text-amber-400"
              iconBackground="bg-amber-500/10"
            />
            <StatCard
              label="Agendamentos"
              value={data.summary.scheduled.value}
              description="Conteúdos programados neste período"
              trend={data.summary.scheduled.trend}
              icon={CalendarClock}
              iconClassName="text-blue-400"
              iconBackground="bg-blue-500/10"
            />
            <StatCard
              label="Falhas de envio"
              value={data.summary.failures.value}
              description="Tentativas que retornaram erro por conta"
              trend={data.summary.failures.trend}
              icon={AlertCircle}
              iconClassName="text-red-400"
              iconBackground="bg-red-500/10"
              inverseTrend
            />
          </section>

          {!hasAccounts ? (
            <section className="rounded-2xl border border-dashed border-white/10 bg-[#111] px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-500/10">
                <Instagram size={24} className="text-purple-400" />
              </div>
              <h2 className="font-semibold text-white">Nenhuma conta conectada</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">
                Configure seu App Meta e conecte a primeira conta para começar a publicar e acompanhar os resultados.
              </p>
              <Link
                href="/dashboard/meta-app"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                <Instagram size={15} />
                Conectar pelo App Meta
              </Link>
            </section>
          ) : (
            <>
            <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="rounded-2xl border border-white/[0.07] bg-[#111] p-5 xl:col-span-2">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-semibold text-white">Visão das contas</h2>
                    <p className="mt-1 text-xs text-gray-500">
                      Audiência e conteúdo sincronizados pela API oficial.
                    </p>
                  </div>
                  <Link
                    href="/dashboard/accounts"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-400 hover:text-purple-300"
                  >
                    Ver contas
                    <ArrowRight size={13} />
                  </Link>
                </div>

                <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
                    <p className="text-[10px] uppercase tracking-wide text-gray-600">
                      Seguidores totais
                    </p>
                    <p className="mt-1.5 text-xl font-semibold text-white">
                      {formatCompactNumber(data.audience.totalFollowers)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
                    <p className="text-[10px] uppercase tracking-wide text-gray-600">
                      Posts nos perfis
                    </p>
                    <p className="mt-1.5 text-xl font-semibold text-white">
                      {formatCompactNumber(data.audience.totalMedia)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
                    <p className="text-[10px] uppercase tracking-wide text-gray-600">
                      Média por conta
                    </p>
                    <p className="mt-1.5 text-xl font-semibold text-white">
                      {formatCompactNumber(data.audience.averageFollowers)}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {data.accounts.slice(0, 4).map((account) => {
                    const followers = account.followerCount || 0
                    const width = Math.max(4, (followers / maxFollowers) * 100)

                    return (
                      <div
                        key={account.id}
                        className="rounded-xl border border-white/[0.05] bg-black/10 px-3.5 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <AccountAvatar
                            src={account.profilePicture}
                            username={account.username}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-white">
                                  @{account.username}
                                </p>
                                <p className="truncate text-[10px] text-gray-600">
                                  {account.name || account.accountType || "Instagram"}
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-xs font-semibold text-gray-200">
                                  {formatCompactNumber(followers)}
                                </p>
                                <p className="text-[10px] text-gray-600">seguidores</p>
                              </div>
                            </div>
                            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.05]">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500"
                                style={{ width: `${width}%` }}
                              />
                            </div>
                          </div>
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              account.requiresReconnect
                                ? "bg-red-400"
                                : "bg-green-400"
                            }`}
                            title={
                              account.requiresReconnect
                                ? "Precisa reconectar"
                                : "Conectada"
                            }
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-amber-500/20 bg-[#111] p-5 shadow-[0_0_30px_-14px_rgba(251,191,36,0.35)]">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 font-semibold text-white">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-yellow-300 to-amber-500 text-amber-950">
                        <Trophy size={12} strokeWidth={2.4} />
                      </span>
                      Ranking geral
                    </h2>
                    <p className="mt-1 text-xs text-gray-500">
                      Top views hoje, entre todos os usuários.
                    </p>
                  </div>
                  {ranking?.updatedAt && !rankingLoading && (
                    <span className="shrink-0 text-[10px] text-gray-600">
                      {formatDate(ranking.updatedAt)}
                    </span>
                  )}
                </div>

                {rankingLoading ? (
                  <div className="flex min-h-56 items-center justify-center">
                    <Loader2 size={18} className="animate-spin text-purple-400" />
                  </div>
                ) : !ranking || ranking.ranking.length === 0 ? (
                  <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.08] px-5 text-center">
                    <Trophy size={19} className="text-gray-700" />
                    <p className="mt-3 text-sm font-medium text-gray-300">
                      Ninguém no ranking ainda hoje
                    </p>
                    <p className="mt-1 text-xs leading-5 text-gray-600">
                      Assim que alguma conta registrar views hoje, o ranking aparece aqui.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {ranking.ranking.map((entry) => (
                      <RankingRow key={entry.userId} entry={entry} />
                    ))}

                    {ranking.you && (
                      <>
                        <div className="relative py-1 text-center">
                          <div className="absolute left-0 right-0 top-1/2 h-px bg-white/[0.06]" />
                          <span className="relative bg-[#111] px-2 text-[10px] text-gray-600">
                            sua posição
                          </span>
                        </div>
                        <RankingRow entry={ranking.you} detached />
                      </>
                    )}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-white">Próximas publicações</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    O que está na fila pra sair, na ordem do horário.
                  </p>
                </div>
                <Link
                  href="/dashboard/queue"
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-purple-400 hover:text-purple-300"
                >
                  Ver fila
                  <ArrowRight size={13} />
                </Link>
              </div>

              {data.upcomingPosts.length === 0 ? (
                <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.08] px-5 text-center">
                  <CalendarClock size={19} className="text-gray-700" />
                  <p className="mt-3 text-sm font-medium text-gray-300">
                    Nada agendado
                  </p>
                  <p className="mt-1 text-xs leading-5 text-gray-600">
                    Crie uma automação pra ver as próximas publicações aqui.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.05]">
                  {data.upcomingPosts.map((post) => (
                    <div key={post.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <AccountAvatar
                        src={post.account?.profilePicture || null}
                        username={post.account?.username || "conta"}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-white">
                          {post.account ? `@${post.account.username}` : post.caption}
                        </p>
                        <p className="mt-0.5 text-[10px] text-gray-600">
                          {formatDate(post.scheduledAt)} · {post.kind}
                        </p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-300">
                        Na fila
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
            </>
          )}

        </>
      ) : null}
    </div>
  )
}
