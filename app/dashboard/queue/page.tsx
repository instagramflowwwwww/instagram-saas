"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  Ban,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  Clock3,
  Film,
  ImageIcon,
  Instagram,
  ListChecks,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react"
import toast from "react-hot-toast"
import { confirmToast, toastWarning } from "@/lib/toast"

type BatchItem = {
  id: string
  position: number
  caption: string | null
  hashtags: string | null
  scheduledAt: string
  status: string
  attempts: number
  lastError: string | null
  processedAt: string | null
  media: {
    id: string
    url: string
    type: "image" | "video"
    fileName: string
  } | null
  post: {
    id: string
    status: string
    publishedAt: string | null
  } | null
}

type Batch = {
  id: string
  name: string | null
  status: string
  captionMode: string
  publicationType: string
  intervalMinutes: number
  startAt: string
  totalItems: number
  processedItems: number
  successItems: number
  failedItems: number
  createdAt: string
  accounts: Array<{
    instagramAccount: {
      id: string
      username: string
      profilePicture: string | null
      isActive: boolean
    }
  }>
  items: BatchItem[]
}

type QueueResponse = {
  batches: Batch[]
  generatedAt: string
  executorConfigured: boolean
}

const STATUS: Record<
  string,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  scheduled: {
    label: "Agendada",
    className: "border-blue-500/20 bg-blue-500/10 text-blue-300",
    icon: CalendarClock,
  },
  processing: {
    label: "Em andamento",
    className: "border-purple-500/20 bg-purple-500/10 text-purple-300",
    icon: Loader2,
  },
  completed: {
    label: "Concluída",
    className: "border-green-500/20 bg-green-500/10 text-green-300",
    icon: CheckCircle2,
  },
  completed_with_errors: {
    label: "Concluída com falhas",
    className: "border-yellow-500/20 bg-yellow-500/10 text-yellow-300",
    icon: AlertCircle,
  },
  cancelled: {
    label: "Cancelada",
    className: "border-white/10 bg-white/5 text-gray-400",
    icon: Ban,
  },
  pending: {
    label: "Pendente",
    className: "border-blue-500/20 bg-blue-500/10 text-blue-300",
    icon: Clock3,
  },
  published: {
    label: "Publicado",
    className: "border-green-500/20 bg-green-500/10 text-green-300",
    icon: CheckCircle2,
  },
  partial: {
    label: "Parcial",
    className: "border-yellow-500/20 bg-yellow-500/10 text-yellow-300",
    icon: AlertCircle,
  },
  failed: {
    label: "Falhou",
    className: "border-red-500/20 bg-red-500/10 text-red-300",
    icon: XCircle,
  },
  cancelled_item: {
    label: "Cancelado",
    className: "border-white/10 bg-white/5 text-gray-400",
    icon: Ban,
  },
}

function formatDate(value: string | null) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value))
}

function statusInfo(status: string) {
  return (
    STATUS[status] || {
      label: status,
      className: "border-white/10 bg-white/5 text-gray-400",
      icon: CircleDashed,
    }
  )
}

export default function QueuePage() {
  const [data, setData] = useState<QueueResponse>({
    batches: [],
    generatedAt: "",
    executorConfigured: false,
  })
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string[]>([])
  const [filter, setFilter] = useState<"all" | "active" | "done">("all")

  const load = useCallback(async (silent = false, notifySuccess = false) => {
    if (!silent) setLoading(true)
    try {
      const response = await fetch("/api/batches", { cache: "no-store" })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Erro ao carregar a fila")
      setData(payload)
      if (notifySuccess) toast.success("Fila atualizada.")
    } catch (requestError) {
      toast.error(
        requestError instanceof Error ? requestError.message : "Erro ao carregar a fila",
        { id: "queue-load-error" }
      )
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = window.setInterval(() => load(true), 15_000)
    return () => window.clearInterval(interval)
  }, [load])

  useEffect(() => {
    if (loading || data.executorConfigured) return
    toastWarning(
      "O processamento automático ainda precisa de CRON_SECRET (Vercel Cron) ou QUEUE_CRON_SECRET (executor externo).",
      "queue-executor-warning"
    )
  }, [data.executorConfigured, loading])

  const callAction = async (key: string, url: string, method = "POST") => {
    setWorking(key)
    try {
      const response = await fetch(url, { method })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "A ação não foi concluída")
      await load(true)
      const successMessage = key.startsWith("retry-")
        ? "Falhas colocadas novamente na fila."
        : key.startsWith("cancel-")
          ? "Automação cancelada."
          : "Fila processada com sucesso."
      toast.success(successMessage)
    } catch (actionError) {
      toast.error(actionError instanceof Error ? actionError.message : "A ação não foi concluída")
    } finally {
      setWorking(null)
    }
  }

  const batches = useMemo(() => {
    if (filter === "active") {
      return data.batches.filter((batch) => ["scheduled", "processing"].includes(batch.status))
    }
    if (filter === "done") {
      return data.batches.filter((batch) =>
        ["completed", "completed_with_errors", "cancelled"].includes(batch.status)
      )
    }
    return data.batches
  }, [data.batches, filter])

  const summary = useMemo(
    () => ({
      active: data.batches.filter((batch) => ["scheduled", "processing"].includes(batch.status)).length,
      pending: data.batches.reduce(
        (total, batch) => total + batch.items.filter((item) => item.status === "pending").length,
        0
      ),
      published: data.batches.reduce(
        (total, batch) => total + batch.items.filter((item) => item.status === "published").length,
        0
      ),
      failed: data.batches.reduce(
        (total, batch) => total + batch.items.filter((item) => ["failed", "partial"].includes(item.status)).length,
        0
      ),
    }),
    [data.batches]
  )

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Status da fila</h1>
          <p className="mt-1 text-sm text-gray-500">Acompanhe sequências, tentativas e próximas publicações.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => callAction("process", "/api/queue/process")}
            disabled={working === "process"}
            className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2.5 text-sm font-medium text-purple-300 hover:bg-purple-500/15 disabled:opacity-50"
          >
            {working === "process" ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            Processar agora
          </button>
          <button
            onClick={() => load(false, true)}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/10"
          >
            <RefreshCw size={15} /> Atualizar
          </button>
          <Link
            href="/dashboard/stories"
            className="flex items-center gap-2 rounded-lg border border-pink-500/25 bg-pink-500/10 px-4 py-2.5 text-sm font-medium text-pink-300 hover:bg-pink-500/15"
          >
            <Sparkles size={15} /> Novos Stories
          </Link>
          <Link
            href="/dashboard/schedule"
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            <CalendarClock size={15} /> Nova automação
          </Link>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Automações ativas", value: summary.active, icon: CalendarClock, color: "text-purple-400" },
          { label: "Itens pendentes", value: summary.pending, icon: Clock3, color: "text-blue-400" },
          { label: "Publicados", value: summary.published, icon: CheckCircle2, color: "text-green-400" },
          { label: "Com falha", value: summary.failed, icon: AlertCircle, color: "text-red-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-2xl border border-white/[0.07] bg-[#111] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">{label}</p>
              <Icon size={15} className={color} />
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="mb-5 flex gap-2">
        {(["all", "active", "done"] as const).map((value) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`rounded-lg border px-4 py-1.5 text-sm ${
              filter === value
                ? "border-purple-500/30 bg-purple-500/15 text-purple-300"
                : "border-white/[0.07] bg-white/[0.025] text-gray-500"
            }`}
          >
            {value === "all" ? "Todas" : value === "active" ? "Ativas" : "Finalizadas"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={24} className="animate-spin text-purple-400" />
        </div>
      ) : batches.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.07] bg-[#111] p-16 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-500/10">
            <ListChecks size={24} className="text-purple-400" />
          </div>
          <h3 className="mb-2 font-semibold text-white">Nenhuma automação nesta lista</h3>
          <p className="mx-auto mb-5 max-w-sm text-sm text-gray-500">
            Escolha várias mídias da biblioteca, defina as legendas e o intervalo entre publicações.
          </p>
          <Link href="/dashboard/schedule" className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white">
            <CalendarClock size={15} /> Criar automação
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {batches.map((batch) => {
            const info = statusInfo(batch.status)
            const Icon = info.icon
            const isExpanded = expanded.includes(batch.id)
            const progress = batch.totalItems > 0 ? Math.round((batch.processedItems / batch.totalItems) * 100) : 0
            const nextItem = batch.items.find((item) => item.status === "pending")
            const canCancel = ["scheduled", "processing"].includes(batch.status)
            const canRetry = batch.items.some((item) => item.status === "failed")

            return (
              <section key={batch.id} className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111]">
                <div className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-base font-semibold text-white">
                          {batch.name || `${batch.publicationType === "story" ? "Stories" : "Sequência"} de ${batch.totalItems} mídias`}
                        </h2>
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${batch.publicationType === "story" ? "border-pink-500/20 bg-pink-500/10 text-pink-300" : "border-purple-500/20 bg-purple-500/10 text-purple-300"}`}>
                          {batch.publicationType === "story" ? <Sparkles size={11} /> : <CalendarClock size={11} />}
                          {batch.publicationType === "story" ? "Stories" : "Posts"}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${info.className}`}>
                          <Icon size={12} className={batch.status === "processing" ? "animate-spin" : ""} />
                          {info.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Início {formatDate(batch.startAt)} · intervalo de {batch.intervalMinutes} min · {batch.totalItems} {batch.publicationType === "story" ? "Story(s)" : "mídia(s)"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {canRetry && (
                        <button
                          onClick={() => callAction(`retry-${batch.id}`, `/api/batches/${batch.id}/retry`)}
                          disabled={working === `retry-${batch.id}`}
                          className="flex items-center gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs font-medium text-yellow-300 disabled:opacity-50"
                        >
                          {working === `retry-${batch.id}` ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                          Repetir falhas
                        </button>
                      )}
                      {canCancel && (
                        <button
                          onClick={async () => {
                            const confirmed = await confirmToast(
                              "Cancelar todas as publicações pendentes desta automação?",
                              { confirmLabel: "Cancelar automação", danger: true }
                            )
                            if (confirmed) {
                              await callAction(`cancel-${batch.id}`, `/api/batches/${batch.id}`, "DELETE")
                            }
                          }}
                          disabled={working === `cancel-${batch.id}`}
                          className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                      )}
                      <button
                        onClick={() => setExpanded((current) => current.includes(batch.id) ? current.filter((id) => id !== batch.id) : [...current, batch.id])}
                        className="rounded-lg border border-white/10 bg-white/5 p-2 text-gray-400 hover:text-white"
                      >
                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
                    <span>{batch.processedItems} de {batch.totalItems} processadas ({progress}%)</span>
                    <span>{nextItem ? `Próxima: ${formatDate(nextItem.scheduledAt)}` : "Sem itens pendentes"}</span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {batch.accounts.map(({ instagramAccount }) => (
                      <div key={instagramAccount.id} className="flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.025] py-1 pl-1 pr-2.5">
                        {instagramAccount.profilePicture ? <img src={instagramAccount.profilePicture} alt="" className="h-6 w-6 rounded-full object-cover" /> : <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500"><Instagram size={10} /></div>}
                        <span className="text-[11px] text-gray-300">@{instagramAccount.username}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-white/[0.07] bg-black/10 p-4">
                    <div className="space-y-2">
                      {batch.items.map((item) => {
                        const itemInfo = statusInfo(item.status === "cancelled" ? "cancelled_item" : item.status)
                        const ItemIcon = itemInfo.icon
                        return (
                          <div key={item.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 text-xs font-bold text-gray-400">{item.position + 1}</span>
                            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-black">
                              {item.media?.type === "video" ? <video src={item.media.url} className="h-full w-full object-cover" muted /> : item.media ? <img src={item.media.url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><ImageIcon size={14} className="text-gray-600" /></div>}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                {item.media?.type === "video" ? <Film size={12} className="text-purple-400" /> : <ImageIcon size={12} className="text-pink-400" />}
                                <p className="truncate text-xs font-medium text-white">{item.media?.fileName || "Mídia removida da biblioteca"}</p>
                              </div>
                              <p className="mt-1 text-[11px] text-gray-500">{formatDate(item.scheduledAt)} · tentativa {item.attempts || 0}/3</p>
                              {item.lastError && <p className="mt-1 truncate text-[11px] text-red-400" title={item.lastError}>{item.lastError}</p>}
                            </div>
                            <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${itemInfo.className}`}>
                              <ItemIcon size={11} className={item.status === "processing" ? "animate-spin" : ""} /> {itemInfo.label}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {data.generatedAt && (
        <p className="mt-5 text-right text-[11px] text-gray-600">Última leitura: {formatDate(data.generatedAt)}</p>
      )}
    </div>
  )
}
