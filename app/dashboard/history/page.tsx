"use client"

import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clock3,
  FileText,
  Film,
  Filter,
  ImageIcon,
  Instagram,
  Loader2,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Ban,
  XCircle,
} from "lucide-react"
import {
  type ElementType,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import toast from "react-hot-toast"

type Account = {
  id: string
  username: string
  profilePicture: string | null
  isActive: boolean
}

type PostLog = {
  id: string
  status: string
  errorMessage: string | null
  mediaId: string | null
  createdAt: string
  instagramAccount: {
    id: string
    username: string
    name: string | null
    profilePicture: string | null
    isActive: boolean
  }
}

type HistoryPost = {
  id: string
  caption: string | null
  hashtags: string | null
  imageUrl: string | null
  videoUrl: string | null
  thumbnailUrl: string | null
  type: "image" | "reel" | "story"
  status: string
  scheduledAt: string | null
  publishedAt: string | null
  createdAt: string
  successCount: number
  errorCount: number
  accountCount: number
  logs: PostLog[]
}

type HistoryData = {
  posts: HistoryPost[]
  summary: {
    total: number
    published: number
    partial: number
    failed: number
    scheduled: number
    publishing: number
    draft: number
    cancelled: number
  }
  accounts: Account[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  generatedAt: string
}

type SummaryCardProps = {
  label: string
  value: number
  icon: ElementType
  iconClassName: string
  iconBackground: string
}

const STATUS_CONFIG: Record<
  string,
  {
    label: string
    className: string
    dotClassName: string
    icon: ElementType
  }
> = {
  published: {
    label: "Publicado",
    className: "border-green-500/20 bg-green-500/10 text-green-300",
    dotClassName: "bg-green-400",
    icon: CheckCircle2,
  },
  partial: {
    label: "Parcial",
    className: "border-yellow-500/20 bg-yellow-500/10 text-yellow-300",
    dotClassName: "bg-yellow-400",
    icon: AlertCircle,
  },
  failed: {
    label: "Falhou",
    className: "border-red-500/20 bg-red-500/10 text-red-300",
    dotClassName: "bg-red-400",
    icon: XCircle,
  },
  scheduled: {
    label: "Agendado",
    className: "border-blue-500/20 bg-blue-500/10 text-blue-300",
    dotClassName: "bg-blue-400",
    icon: CalendarClock,
  },
  publishing: {
    label: "Publicando",
    className: "border-purple-500/20 bg-purple-500/10 text-purple-300",
    dotClassName: "bg-purple-400",
    icon: Loader2,
  },
  cancelled: {
    label: "Cancelado",
    className: "border-white/10 bg-white/[0.04] text-gray-400",
    dotClassName: "bg-gray-500",
    icon: Ban,
  },
  draft: {
    label: "Rascunho",
    className: "border-white/10 bg-white/[0.04] text-gray-400",
    dotClassName: "bg-gray-500",
    icon: FileText,
  },
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value)
}

function formatDate(value: string | null) {
  if (!value) return "—"

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value))
}

function formatRelativeDate(value: string) {
  const elapsed = Date.now() - new Date(value).getTime()
  const minutes = Math.floor(elapsed / 60_000)

  if (minutes < 1) return "agora"
  if (minutes < 60) return `há ${minutes} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours}h`

  const days = Math.floor(hours / 24)
  if (days < 7) return `há ${days}d`

  return formatDate(value)
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
  const classes = size === "sm" ? "h-8 w-8" : "h-10 w-10"

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
      <Instagram size={size === "sm" ? 13 : 16} />
    </div>
  )
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  iconClassName,
  iconBackground,
}: SummaryCardProps) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#111] p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-white">
            {formatNumber(value)}
          </p>
        </div>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconBackground}`}
        >
          <Icon size={16} className={iconClassName} />
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft
  const Icon = config.icon

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${config.className}`}
    >
      <Icon
        size={12}
        className={status === "publishing" ? "animate-spin" : ""}
      />
      {config.label}
    </span>
  )
}

export default function HistoryPage() {
  const [data, setData] = useState<HistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState("all")
  const [type, setType] = useState("all")
  const [accountId, setAccountId] = useState("")
  const [search, setSearch] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const loadHistory = useCallback(
    async (showRefresh = false) => {
      setRefreshing(showRefresh)

      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: "20",
          status,
          type,
          from: dateFrom,
          to: dateTo,
        })

        if (accountId) params.set("accountId", accountId)
        if (search) params.set("search", search)

        const response = await fetch(`/api/posts/history?${params}`, {
          cache: "no-store",
        })
        const payload = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(
            payload.error || "Não foi possível carregar o histórico."
          )
        }

        setData(payload)
        if (showRefresh) toast.success("Histórico atualizado.")
      } catch (loadError) {
        toast.error(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar o histórico.",
          { id: "history-load-error" }
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [accountId, dateFrom, dateTo, page, search, status, type]
  )

  useEffect(() => {
    setLoading(true)
    void loadHistory()
  }, [loadHistory])

  const activeFilterCount = useMemo(
    () =>
      [
        status !== "all",
        type !== "all",
        Boolean(accountId),
        Boolean(search),
      ].filter(Boolean).length,
    [accountId, search, status, type]
  )

  function applySearch() {
    setPage(1)
    setSearch(searchInput.trim())
  }

  function clearFilters() {
    setPage(1)
    setStatus("all")
    setType("all")
    setAccountId("")
    setSearch("")
    setSearchInput("")
    setDateFrom("")
    setDateTo("")
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Histórico</h1>
          <p className="mt-1 text-sm text-gray-500">
            Logs completos das publicações, entregas e falhas por conta.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadHistory(true)}
          disabled={refreshing}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-gray-300 transition hover:border-purple-500/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          Atualizar logs
        </button>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          label="Total no período"
          value={data?.summary.total || 0}
          icon={FileText}
          iconClassName="text-purple-300"
          iconBackground="bg-purple-500/10"
        />
        <SummaryCard
          label="Publicadas"
          value={data?.summary.published || 0}
          icon={CheckCircle2}
          iconClassName="text-green-300"
          iconBackground="bg-green-500/10"
        />
        <SummaryCard
          label="Parciais"
          value={data?.summary.partial || 0}
          icon={AlertCircle}
          iconClassName="text-yellow-300"
          iconBackground="bg-yellow-500/10"
        />
        <SummaryCard
          label="Com falha"
          value={data?.summary.failed || 0}
          icon={XCircle}
          iconClassName="text-red-300"
          iconBackground="bg-red-500/10"
        />
        <SummaryCard
          label="Agendadas"
          value={data?.summary.scheduled || 0}
          icon={CalendarClock}
          iconClassName="text-blue-300"
          iconBackground="bg-blue-500/10"
        />
      </section>

      <section className="rounded-2xl border border-white/[0.07] bg-[#111] p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_repeat(3,minmax(150px,190px))]">
          <div className="flex h-10 items-center rounded-xl border border-white/10 bg-black/20 px-3 focus-within:border-purple-500/40">
            <Search size={15} className="shrink-0 text-gray-600" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applySearch()
              }}
              placeholder="Legenda, @conta ou erro..."
              className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm text-white outline-none placeholder:text-gray-600"
            />
            <button
              type="button"
              onClick={applySearch}
              className="text-xs font-medium text-purple-300 hover:text-purple-200"
            >
              Buscar
            </button>
          </div>

          <select
            value={status}
            onChange={(event) => {
              setPage(1)
              setStatus(event.target.value)
            }}
            className="h-10 rounded-xl border border-white/10 bg-[#161616] px-3 text-sm text-gray-300 outline-none focus:border-purple-500/40"
          >
            <option value="all">Todos os status</option>
            <option value="published">Publicado</option>
            <option value="partial">Parcial</option>
            <option value="failed">Falhou</option>
            <option value="scheduled">Agendado</option>
            <option value="publishing">Publicando</option>
            <option value="draft">Rascunho</option>
            <option value="cancelled">Cancelado</option>
          </select>

          <select
            value={type}
            onChange={(event) => {
              setPage(1)
              setType(event.target.value)
            }}
            className="h-10 rounded-xl border border-white/10 bg-[#161616] px-3 text-sm text-gray-300 outline-none focus:border-purple-500/40"
          >
            <option value="all">Todos os conteúdos</option>
            <option value="image">Imagens</option>
            <option value="reel">Reels</option>
            <option value="story">Stories</option>
          </select>

          <select
            value={accountId}
            onChange={(event) => {
              setPage(1)
              setAccountId(event.target.value)
            }}
            className="h-10 rounded-xl border border-white/10 bg-[#161616] px-3 text-sm text-gray-300 outline-none focus:border-purple-500/40"
          >
            <option value="">Todas as contas</option>
            {(data?.accounts || []).map((account) => (
              <option key={account.id} value={account.id}>
                @{account.username}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex flex-col gap-3 border-t border-white/[0.06] pt-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Filter size={13} />
              {activeFilterCount > 0
                ? `${activeFilterCount} filtro${activeFilterCount > 1 ? "s" : ""} ativo${activeFilterCount > 1 ? "s" : ""}`
                : "Sem filtros adicionais"}
            </div>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs font-medium text-purple-300 hover:text-purple-200"
              >
                Limpar filtros
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setPage(1)
                setDateFrom(event.target.value)
              }}
              className="h-9 rounded-lg border border-white/10 bg-[#161616] px-2.5 text-xs text-gray-300 outline-none focus:border-purple-500/40"
            />
            <span className="text-xs text-gray-600">até</span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setPage(1)
                setDateTo(event.target.value)
              }}
              className="h-9 rounded-lg border border-white/10 bg-[#161616] px-2.5 text-xs text-gray-300 outline-none focus:border-purple-500/40"
            />
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex min-h-72 items-center justify-center rounded-2xl border border-white/[0.07] bg-[#111]">
          <div className="text-center">
            <Loader2 size={26} className="mx-auto animate-spin text-purple-400" />
            <p className="mt-3 text-sm text-gray-500">Carregando histórico...</p>
          </div>
        </div>
      ) : data?.posts.length ? (
        <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111]">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Logs de publicação</h2>
              <p className="mt-0.5 text-xs text-gray-600">
                {formatNumber(data.pagination.total)} registro
                {data.pagination.total === 1 ? "" : "s"} encontrado
                {data.pagination.total === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-gray-600">
              <span className="h-2 w-2 rounded-full bg-green-400" />
              Atualizado {formatRelativeDate(data.generatedAt)}
            </div>
          </div>

          <div className="divide-y divide-white/[0.06]">
            {data.posts.map((post) => {
              const expanded = expandedId === post.id
              const config = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft
              const accounts = Array.from(
                new Map(
                  post.logs.map((log) => [
                    log.instagramAccount.id,
                    log.instagramAccount,
                  ])
                ).values()
              )

              return (
                <article key={post.id} className="group">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : post.id)}
                    className="grid w-full gap-4 p-5 text-left transition hover:bg-white/[0.02] lg:grid-cols-[auto_minmax(0,1fr)_auto]"
                  >
                    <div className="relative hidden pt-1 sm:block">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-xl border ${config.className}`}
                      >
                        {post.type === "story" ? (
                          <Sparkles size={17} />
                        ) : post.type === "reel" ? (
                          <Film size={17} />
                        ) : (
                          <ImageIcon size={17} />
                        )}
                      </div>
                      <span
                        className={`absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#111] ${config.dotClassName}`}
                      />
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={post.status} />
                        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-600">
                          {post.type === "story" ? "Story" : post.type === "reel" ? "Reel" : "Imagem"}
                        </span>
                        <span className="text-[11px] text-gray-700">#{post.id.slice(-7)}</span>
                      </div>

                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-gray-300">
                        {post.type === "story" ? "Story publicado pela API oficial" : post.caption || post.hashtags || "Publicação sem legenda"}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-gray-600">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock3 size={12} />
                          Criada {formatDate(post.createdAt)}
                        </span>
                        {post.publishedAt && (
                          <span className="inline-flex items-center gap-1.5 text-green-500/70">
                            <Send size={12} />
                            Publicada {formatDate(post.publishedAt)}
                          </span>
                        )}
                        {post.scheduledAt && (
                          <span className="inline-flex items-center gap-1.5 text-blue-400/70">
                            <CalendarClock size={12} />
                            Agendada {formatDate(post.scheduledAt)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 lg:justify-end">
                      <div className="flex -space-x-2">
                        {accounts.slice(0, 4).map((account) => (
                          <AccountAvatar
                            key={account.id}
                            src={account.profilePicture}
                            username={account.username}
                            size="sm"
                          />
                        ))}
                        {accounts.length > 4 && (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#111] bg-[#242424] text-[10px] font-semibold text-gray-400">
                            +{accounts.length - 4}
                          </div>
                        )}
                      </div>

                      <div className="hidden min-w-28 text-right sm:block">
                        <p className="text-xs font-medium text-gray-300">
                          {post.successCount} sucesso
                          {post.successCount === 1 ? "" : "s"}
                        </p>
                        <p
                          className={`mt-1 text-[11px] ${
                            post.errorCount > 0 ? "text-red-400" : "text-gray-600"
                          }`}
                        >
                          {post.errorCount} falha{post.errorCount === 1 ? "" : "s"}
                        </p>
                      </div>

                      <ChevronDown
                        size={17}
                        className={`text-gray-600 transition-transform ${
                          expanded ? "rotate-180 text-purple-300" : ""
                        }`}
                      />
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-white/[0.06] bg-black/20 px-5 py-5">
                      <div className="grid gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
                        <div>
                          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-600">
                            Conteúdo
                          </p>
                          <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#141414]">
                            {post.thumbnailUrl ? (
                              <img
                                src={post.thumbnailUrl}
                                alt="Prévia da publicação"
                                className="aspect-video w-full object-cover"
                              />
                            ) : (
                              <div className="flex aspect-video items-center justify-center bg-white/[0.03]">
                                {post.type === "story" ? (
                                  <Sparkles size={26} className="text-pink-400" />
                                ) : post.type === "reel" ? (
                                  <Film size={26} className="text-purple-400" />
                                ) : (
                                  <ImageIcon size={26} className="text-pink-400" />
                                )}
                              </div>
                            )}
                            <div className="space-y-2 p-3">
                              <p className="line-clamp-3 text-xs leading-5 text-gray-400">
                                {post.type === "story" ? "Stories não recebem legenda pela API oficial." : post.caption || "Sem legenda"}
                              </p>
                              {post.hashtags && (
                                <p className="line-clamp-2 text-[11px] leading-5 text-purple-300/70">
                                  {post.hashtags}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div>
                          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-600">
                            Entregas por conta
                          </p>

                          {post.logs.length > 0 ? (
                            <div className="space-y-2">
                              {post.logs.map((log, index) => {
                                const success = log.status === "success"
                                return (
                                  <div
                                    key={log.id}
                                    className="relative flex gap-3 rounded-xl border border-white/[0.07] bg-[#141414] p-3"
                                  >
                                    {index < post.logs.length - 1 && (
                                      <span className="absolute bottom-[-9px] left-[28px] top-[44px] w-px bg-white/[0.08]" />
                                    )}
                                    <AccountAvatar
                                      src={log.instagramAccount.profilePicture}
                                      username={log.instagramAccount.username}
                                      size="sm"
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                          <p className="text-sm font-medium text-white">
                                            @{log.instagramAccount.username}
                                          </p>
                                          {log.instagramAccount.name && (
                                            <p className="mt-0.5 text-[11px] text-gray-600">
                                              {log.instagramAccount.name}
                                            </p>
                                          )}
                                        </div>
                                        <span
                                          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold ${
                                            success
                                              ? "border-green-500/20 bg-green-500/10 text-green-300"
                                              : "border-red-500/20 bg-red-500/10 text-red-300"
                                          }`}
                                        >
                                          {success ? (
                                            <CheckCircle2 size={11} />
                                          ) : (
                                            <XCircle size={11} />
                                          )}
                                          {success ? "Entregue" : "Erro"}
                                        </span>
                                      </div>

                                      {log.errorMessage && (
                                        <div className="mt-3 rounded-lg border border-red-500/15 bg-red-500/[0.07] px-3 py-2 text-xs leading-5 text-red-300">
                                          {log.errorMessage}
                                        </div>
                                      )}

                                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-gray-600">
                                        <span>{formatDate(log.createdAt)}</span>
                                        {log.mediaId && (
                                          <span className="font-mono">
                                            Media ID: {log.mediaId}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] text-center">
                              <CircleDashed size={22} className="text-gray-600" />
                              <p className="mt-3 text-sm font-medium text-gray-400">
                                Nenhuma tentativa registrada
                              </p>
                              <p className="mt-1 max-w-sm text-xs text-gray-600">
                                Rascunhos e agendamentos ainda não possuem logs por conta.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>

          <div className="flex flex-col gap-3 border-t border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-600">
              Página {data.pagination.page} de {data.pagination.totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={data.pagination.page <= 1}
                onClick={() => {
                  setExpandedId(null)
                  setPage((current) => Math.max(1, current - 1))
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs text-gray-400 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={14} />
                Anterior
              </button>
              <button
                type="button"
                disabled={data.pagination.page >= data.pagination.totalPages}
                onClick={() => {
                  setExpandedId(null)
                  setPage((current) => current + 1)
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs text-gray-400 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Próxima
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </section>
      ) : (
        <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-[#111] px-5 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-500/10">
            <FileText size={24} className="text-purple-400" />
          </div>
          <h2 className="mt-5 text-base font-semibold text-white">
            Nenhum log encontrado
          </h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">
            As publicações e erros aparecerão aqui assim que você enviar conteúdo para alguma conta.
          </p>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-5 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-purple-500"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}
    </div>
  )
}
