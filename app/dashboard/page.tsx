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
  ImageIcon,
  Instagram,
  Loader2,
  Minus,
  Play,
  RefreshCw,
  Send,
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

type DashboardData = {
  summary: {
    accounts: Metric & {
      totalConfigured: number
      newInPeriod: number
    }
    published: Metric
    scheduled: Metric
    failures: Metric
  }
  audience: {
    totalFollowers: number
    totalMedia: number
    averageFollowers: number
  }
  accounts: DashboardAccount[]
  recentPosts: RecentPost[]
  generatedAt: string
}

type StatCardProps = {
  label: string
  value: number
  description: string
  trend: number | null
  icon: ElementType
  iconClassName: string
  iconBackground: string
  inverseTrend?: boolean
}

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string; dot: string }
> = {
  published: {
    label: "Publicado",
    className: "border-green-500/20 bg-green-500/10 text-green-400",
    dot: "bg-green-400",
  },
  partial: {
    label: "Parcial",
    className: "border-yellow-500/20 bg-yellow-500/10 text-yellow-300",
    dot: "bg-yellow-400",
  },
  scheduled: {
    label: "Agendado",
    className: "border-blue-500/20 bg-blue-500/10 text-blue-300",
    dot: "bg-blue-400",
  },
  publishing: {
    label: "Publicando",
    className: "border-purple-500/20 bg-purple-500/10 text-purple-300",
    dot: "bg-purple-400",
  },
  failed: {
    label: "Falhou",
    className: "border-red-500/20 bg-red-500/10 text-red-300",
    dot: "bg-red-400",
  },
  draft: {
    label: "Rascunho",
    className: "border-white/10 bg-white/[0.04] text-gray-400",
    dot: "bg-gray-500",
  },
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
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#111] p-5 transition-colors hover:border-white/10">
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
        <TrendBadge value={trend} inverse={inverseTrend} />
        <p className="text-[11px] text-gray-600">{description}</p>
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
    <div className="space-y-6">
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
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
              description="Publicações com pelo menos um envio aprovado"
              trend={data.summary.published.trend}
              icon={CheckCircle2}
              iconClassName="text-green-400"
              iconBackground="bg-green-500/10"
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

              <div className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-white">Atividade recente</h2>
                    <p className="mt-1 text-xs text-gray-500">
                      Últimas publicações e tentativas.
                    </p>
                  </div>
                  <Link
                    href="/dashboard/history"
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-purple-400 hover:text-purple-300"
                  >
                    Ver histórico
                    <ArrowRight size={13} />
                  </Link>
                </div>

                {data.recentPosts.length === 0 ? (
                  <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.08] px-5 text-center">
                    <Send size={19} className="text-gray-700" />
                    <p className="mt-3 text-sm font-medium text-gray-300">
                      Nenhuma atividade
                    </p>
                    <p className="mt-1 text-xs leading-5 text-gray-600">
                      As próximas publicações aparecerão aqui.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.05]">
                    {data.recentPosts.slice(0, 5).map((post) => {
                      const status = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft
                      const activityDate =
                        post.publishedAt || post.scheduledAt || post.createdAt

                      return (
                        <div key={post.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.03]">
                            {post.thumbnailUrl ? (
                              <img
                                src={post.thumbnailUrl}
                                alt="Prévia da publicação"
                                className="h-full w-full object-cover"
                              />
                            ) : post.kind === "Reel" ? (
                              <Play size={14} className="text-purple-400" />
                            ) : (
                              <ImageIcon size={14} className="text-purple-400" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-gray-200">
                              {post.caption}
                            </p>
                            <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-600">
                              <span>{formatDate(activityDate)}</span>
                              {post.errorCount > 0 ? (
                                <span className="text-red-400/80">
                                  {post.errorCount} falha(s)
                                </span>
                              ) : (
                                <span>{post.successCount} envio(s)</span>
                              )}
                            </div>
                          </div>

                          <span
                            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium ${status.className}`}
                            title={post.errorMessage || undefined}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                            {status.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </section>
          )}

        </>
      ) : null}
    </div>
  )
}
