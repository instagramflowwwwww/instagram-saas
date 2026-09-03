"use client"

export const dynamic = "force-dynamic"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Activity,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Instagram,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react"
import toast from "react-hot-toast"

type DayEntry = { day: string; count: number }

type AccountSummary = {
  id: string
  username: string
  profilePicture: string | null
  createdAt: string
  lastActiveAt: string
  tokenExpiresAt: string | null
  autoDeleteAt: string | null
}

type HealthData = {
  today: number
  yesterday: number
  last7: number
  last30: number
  total: number
  connected: number
  needsReconnect: number
  disconnected: number
  activeDays: number
  firstAccountAt: string | null
  series: DayEntry[]
  offline: AccountSummary[]
  online: AccountSummary[]
  droppedToday: number
  droppedYesterday: number
  daily: Record<string, number>
  dailyDrops: Record<string, number>
}

// Cores conferidas com o validador de paleta contra o fundo #111:
// separação para daltonismo, croma e contraste aprovados.
const BAR = "#7C6BF0"
const GOOD = "#2DD4A7"
const BAD = "#F2596B"

function formatDay(day: string, style: "short" | "long" = "short") {
  const [year, month, date] = day.split("-").map(Number)
  const parsed = new Date(year, month - 1, date)
  return parsed.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: style === "long" ? "long" : "2-digit",
    ...(style === "long" ? { weekday: "long" } : {}),
  })
}

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"]
const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

function firstUpper(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function dayKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function MonthCalendar({
  daily,
  dailyDrops,
  todayKey,
  firstAccountAt,
}: {
  daily: Record<string, number>
  dailyDrops: Record<string, number>
  todayKey: string
  firstAccountAt: string | null
}) {
  const [year, month] = todayKey.split("-").map(Number)
  const [view, setView] = useState({ year, month: month - 1 })

  const firstDate = firstAccountAt ? new Date(firstAccountAt) : null
  const lowerBound = firstDate
    ? firstDate.getFullYear() * 12 + firstDate.getMonth()
    : year * 12 + (month - 1)
  const upperBound = year * 12 + (month - 1)
  const current = view.year * 12 + view.month

  const shift = (step: number) => {
    const next = current + step
    if (next < lowerBound || next > upperBound) return
    setView({ year: Math.floor(next / 12), month: next % 12 })
  }

  const firstWeekday = new Date(view.year, view.month, 1).getDay()
  const totalDays = new Date(view.year, view.month + 1, 0).getDate()

  const monthAdded = Array.from({ length: totalDays }, (_, i) =>
    daily[dayKey(view.year, view.month, i + 1)] || 0
  )
  const peak = Math.max(1, ...monthAdded)
  const addedTotal = monthAdded.reduce((total, value) => total + value, 0)
  const droppedTotal = Array.from({ length: totalDays }, (_, i) =>
    dailyDrops[dayKey(view.year, view.month, i + 1)] || 0
  ).reduce((total, value) => total + value, 0)

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">
          {firstUpper(MONTHS[view.month])} de {view.year}
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => shift(-1)}
            disabled={current <= lowerBound}
            className="rounded-lg border border-white/10 p-1.5 text-gray-400 hover:text-white disabled:opacity-25"
            aria-label="Mês anterior"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => shift(1)}
            disabled={current >= upperBound}
            className="rounded-lg border border-white/10 p-1.5 text-gray-400 hover:text-white disabled:opacity-25"
            aria-label="Próximo mês"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <p className="mb-4 text-xs text-gray-500">
        {addedTotal} entraram · {droppedTotal} caíram neste mês
      </p>

      <div className="mb-1.5 grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((label, index) => (
          <div key={index} className="text-center text-[10px] text-gray-600">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: firstWeekday }, (_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {Array.from({ length: totalDays }, (_, i) => {
          const day = i + 1
          const key = dayKey(view.year, view.month, day)
          const added = daily[key] || 0
          const dropped = dailyDrops[key] || 0
          const isToday = key === todayKey

          return (
            <div
              key={key}
              title={`${day}/${view.month + 1}: ${added} entraram, ${dropped} caíram`}
              className={`flex min-h-[54px] flex-col rounded-lg border p-1.5 ${
                isToday ? "border-white/35" : "border-white/[0.06]"
              }`}
              style={{
                backgroundColor: added > 0 ? `${BAR}${Math.round(
                  25 + (added / peak) * 105
                ).toString(16).padStart(2, "0")}` : "rgba(255,255,255,0.02)",
              }}
            >
              <span className={`text-[10px] tabular-nums ${isToday ? "text-white" : "text-gray-500"}`}>
                {day}
              </span>
              <span className="mt-auto flex flex-col leading-tight">
                {added > 0 && (
                  <span className="text-[11px] font-semibold tabular-nums text-white">+{added}</span>
                )}
                {dropped > 0 && (
                  <span className="text-[11px] font-semibold tabular-nums" style={{ color: BAD }}>
                    −{dropped}
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/5 pt-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded" style={{ backgroundColor: BAR }} />
          +N contas entraram
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded" style={{ backgroundColor: BAD }} />
          −N contas caíram
        </span>
        <span>Quanto mais forte o roxo, mais contas entraram no dia.</span>
      </div>
    </div>
  )
}

function AccountFace({ account }: { account: AccountSummary }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5">
      {account.profilePicture ? (
        <img src={account.profilePicture} alt="" className="h-6 w-6 rounded-full object-cover" />
      ) : (
        <Instagram size={13} className="text-gray-500" />
      )}
    </span>
  )
}

export default function HealthPage() {
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [hovered, setHovered] = useState<{ entry: DayEntry; index: number } | null>(null)

  const load = async () => {
    try {
      const response = await fetch("/api/instagram/health", { cache: "no-store" })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar a saúde das contas.")
      setData(payload as HealthData)
    } catch (loadError) {
      toast.error(loadError instanceof Error ? loadError.message : "Erro ao carregar")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const max = useMemo(
    () => Math.max(1, ...(data?.series || []).map((entry) => entry.count)),
    [data]
  )

  const recentDays = useMemo(
    () => [...(data?.series || [])].reverse().filter((entry) => entry.count > 0).slice(0, 12),
    [data]
  )

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={24} className="animate-spin text-purple-400" />
      </div>
    )
  }

  if (!data) return null

  const average = data.activeDays > 0 ? data.last30 / data.activeDays : 0

  const dropsIn = (days: number) =>
    data.series
      .slice(-days)
      .reduce((total, entry) => total + (data.dailyDrops[entry.day] || 0), 0)

  const todayKey = data.series[data.series.length - 1]?.day || ""

  const tiles = [
    { label: "Hoje", value: data.today, dropped: data.droppedToday },
    { label: "Ontem", value: data.yesterday, dropped: data.droppedYesterday },
    { label: "Últimos 7 dias", value: data.last7, dropped: dropsIn(7) },
    { label: "Últimos 30 dias", value: data.last30, dropped: dropsIn(30) },
  ]

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Activity size={22} className="text-purple-400" />
            Saúde das contas
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Quantas contas entraram por dia e como elas estão hoje.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs text-gray-400 hover:text-white"
        >
          <RefreshCw size={13} />
          Atualizar
        </button>
      </div>

      {/* Números de cabeçalho */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-2xl border border-white/[0.07] bg-[#111] p-5"
          >
            <p className="text-[10px] uppercase tracking-wide text-gray-600">{tile.label}</p>
            <p className="mt-1.5 text-3xl font-semibold tabular-nums text-white">{tile.value}</p>
            <p className="mt-1 text-[11px] text-gray-600">
              entraram
            </p>
            <p
              className="mt-2 border-t border-white/5 pt-2 text-[11px] tabular-nums"
              style={{ color: tile.dropped > 0 ? BAD : undefined }}
            >
              {tile.dropped > 0 ? (
                <>
                  {tile.dropped} caiu{tile.dropped === 1 ? "" : "ram"}
                </>
              ) : (
                <span className="text-gray-600">nenhuma caiu</span>
              )}
            </p>
          </div>
        ))}
      </div>

      {/* Estado atual — cor sempre acompanhada de rótulo e ícone */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
          <div className="flex items-center gap-2">
            <Instagram size={14} className="text-gray-500" />
            <p className="text-xs text-gray-400">Total conectado</p>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{data.total}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
          <div className="flex items-center gap-2">
            <CheckCircle size={14} style={{ color: GOOD }} />
            <p className="text-xs text-gray-400">Funcionando</p>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums" style={{ color: GOOD }}>
            {data.connected}
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
          <div className="flex items-center gap-2">
            <XCircle size={14} style={{ color: BAD }} />
            <p className="text-xs text-gray-400">Precisa reconectar</p>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums" style={{ color: BAD }}>
            {data.needsReconnect}
          </p>
        </div>
      </div>

      {/* Ritmo diário */}
      <div className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">Contas adicionadas por dia</h2>
          <p className="text-xs text-gray-600">últimos 30 dias · passe o mouse nas barras</p>
        </div>
        <p className="mb-5 text-xs text-gray-500">
          {data.activeDays > 0
            ? `${data.activeDays} dia(s) com movimento, média de ${average.toFixed(1)} conta(s) nesses dias.`
            : "Nenhuma conta adicionada nos últimos 30 dias."}
        </p>

        <div className="relative pt-14">
          {hovered && (
            <div
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-black/90 px-3 py-2 text-center backdrop-blur"
              style={{
                // Preso à barra sob o mouse, preso às bordas nos extremos
                left: `clamp(80px, ${((hovered.index + 0.5) / data.series.length) * 100}%, calc(100% - 80px))`,
              }}
            >
              <p className="text-xs font-medium text-white">
                {hovered.entry.count} conta{hovered.entry.count === 1 ? "" : "s"}
              </p>
              <p className="text-[11px] text-gray-400">
                {firstUpper(formatDay(hovered.entry.day, "long"))}
              </p>
            </div>
          )}

          <div
            className="flex h-40 items-end gap-[2px] border-b border-white/10"
            onMouseLeave={() => setHovered(null)}
          >
            {data.series.map((entry, index) => {
              const isEmpty = entry.count === 0
              const height = isEmpty ? 3 : Math.max(6, (entry.count / max) * 148)
              const active = hovered?.entry.day === entry.day

              return (
                <button
                  key={entry.day}
                  type="button"
                  onMouseEnter={() => setHovered({ entry, index })}
                  onFocus={() => setHovered({ entry, index })}
                  aria-label={`${formatDay(entry.day, "long")}: ${entry.count} conta(s)`}
                  className="group flex h-full flex-1 cursor-default flex-col justify-end outline-none"
                >
                  <span
                    className="w-full rounded-t transition-opacity"
                    style={{
                      height: `${height}px`,
                      backgroundColor: isEmpty ? "rgba(255,255,255,0.16)" : BAR,
                      opacity: hovered && !active ? 0.45 : 1,
                    }}
                  />
                </button>
              )
            })}
          </div>

          <div className="mt-2 flex justify-between text-[10px] text-gray-600">
            <span>{formatDay(data.series[0]?.day || "")}</span>
            <span>{formatDay(data.series[data.series.length - 1]?.day || "")}</span>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <MonthCalendar
          daily={data.daily}
          dailyDrops={data.dailyDrops}
          todayKey={todayKey}
          firstAccountAt={data.firstAccountAt}
        />
      </div>

      {/* Quem caiu e quem está de pé, nome por nome */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <XCircle size={15} style={{ color: BAD }} />
              <h2 className="text-sm font-semibold text-white">Caíram</h2>
            </div>
            <span className="text-xs tabular-nums text-gray-500">{data.offline.length}</span>
          </div>

          {data.offline.length === 0 ? (
            <p className="text-xs text-gray-500">Nenhuma conta caiu. Todas estão publicando.</p>
          ) : (
            <>
              <div className="divide-y divide-white/5">
                {data.offline.map((account) => (
                  <div key={account.id} className="flex items-center gap-3 py-2.5">
                    <AccountFace account={account} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white">@{account.username}</p>
                      <p className="text-[11px] text-gray-600">
                        Última atividade em {new Date(account.lastActiveAt).toLocaleDateString("pt-BR")}
                        {account.autoDeleteAt && (
                          <span style={{ color: BAD }}>
                            {" "}· some em {new Date(account.autoDeleteAt).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <Link
                href="/dashboard/meta-app"
                className="mt-4 flex items-center justify-center gap-1.5 rounded-lg border border-purple-500/25 bg-purple-500/10 py-2.5 text-xs font-medium text-purple-300 hover:bg-purple-500/15"
              >
                <RefreshCw size={13} />
                Reconectar pelo App Meta
              </Link>
            </>
          )}
        </section>

        <section className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle size={15} style={{ color: GOOD }} />
              <h2 className="text-sm font-semibold text-white">Funcionando</h2>
            </div>
            <span className="text-xs tabular-nums text-gray-500">{data.online.length}</span>
          </div>

          {data.online.length === 0 ? (
            <p className="text-xs text-gray-500">Nenhuma conta ativa no momento.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {data.online.map((account) => (
                <div key={account.id} className="flex items-center gap-3 py-2.5">
                  <AccountFace account={account} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">@{account.username}</p>
                    <p className="text-[11px] text-gray-600">
                      {account.tokenExpiresAt
                        ? `Acesso válido até ${new Date(account.tokenExpiresAt).toLocaleDateString("pt-BR")}`
                        : "Conectada"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Os mesmos dados em número, para quem prefere ler */}
      <div className="mt-4 rounded-2xl border border-white/[0.07] bg-[#111] p-5">
        <h2 className="mb-4 text-sm font-semibold text-white">Dias com contas adicionadas</h2>
        {recentDays.length === 0 ? (
          <p className="text-xs text-gray-500">Nenhuma conta adicionada nos últimos 30 dias.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {recentDays.map((entry) => (
              <div key={entry.day} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-gray-300">{firstUpper(formatDay(entry.day, "long"))}</span>
                <span className="text-sm font-medium tabular-nums text-white">
                  {entry.count} conta{entry.count === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
        )}
        {data.firstAccountAt && (
          <p className="mt-4 border-t border-white/5 pt-3 text-[11px] text-gray-600">
            Primeira conta conectada em{" "}
            {new Date(data.firstAccountAt).toLocaleDateString("pt-BR")}.
          </p>
        )}
      </div>
    </div>
  )
}
