"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Eye,
  Film,
  ImageIcon,
  Instagram,
  Layers3,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react"
import toast from "react-hot-toast"
import { toastWarning } from "@/lib/toast"

type MediaItem = {
  id: string
  url: string
  type: "image" | "video"
  fileName: string
  format: string | null
  createdAt: string
}

type InstagramAccount = {
  id: string
  username: string
  profilePicture: string | null
  connectionType: string
  isActive: boolean
  requiresReconnect: boolean
}

type PublishMode = "now" | "scheduled"

const INTERVAL_OPTIONS = [5, 10, 15, 30, 60, 120, 360, 720, 1440]

function toLocalInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function formatSchedule(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value)
}

function intervalLabel(minutes: number) {
  if (minutes < 60) return `${minutes} minutos`
  if (minutes === 60) return "1 hora"
  if (minutes < 1440) return `${minutes / 60} horas`
  return "24 horas"
}

type StoryPerformance = {
  id: string
  username: string
  profilePicture: string | null
  viewsCount: number | null
  viewsMetric: string | null
  publishedAt: string
  expiresAt: string
  expired: boolean
  error: string | null
}

function timeLeft(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return "expirado"
  const hours = Math.floor(ms / (60 * 60 * 1000))
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000))
  return hours > 0 ? `${hours}h${minutes}min no ar` : `${minutes}min no ar`
}

function StoriesPerformance() {
  const [stories, setStories] = useState<StoryPerformance[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true)
    try {
      const url = refresh ? "/api/posts/stories-performance?refresh=1" : "/api/posts/stories-performance"
      const response = await fetch(url, { cache: "no-store" })
      const data = await response.json()
      if (response.ok) setStories(Array.isArray(data) ? data : [])
    } catch {
      // desempenho de story é informativo — não trava a tela de publicação
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (loading) return null
  if (!stories || stories.length === 0) return null

  return (
    <div className="mb-6 rounded-2xl border border-white/[0.07] bg-[#111] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Eye size={15} className="text-purple-400" />
          <h2 className="text-sm font-semibold text-white">Desempenho dos stories</h2>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
          Atualizar
        </button>
      </div>
      <p className="mb-4 text-xs text-gray-500">
        Só é possível ver visualizações enquanto o story ainda está no ar (até 24h). Depois disso, fica o
        último número visto.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {stories.map((story) => (
          <div
            key={story.id}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
              story.expired ? "border-white/[0.05] bg-white/[0.015]" : "border-white/[0.07] bg-white/[0.03]"
            }`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-purple-500/10">
              {story.profilePicture ? (
                <img src={story.profilePicture} alt="" className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <Instagram size={13} className="text-purple-400" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-white">@{story.username}</p>
              <p className={`text-[11px] ${story.expired ? "text-gray-600" : "text-purple-300"}`}>
                {timeLeft(story.expiresAt)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold tabular-nums text-white">
                {story.viewsCount !== null ? story.viewsCount.toLocaleString("pt-BR") : "—"}
              </p>
              <p className="text-[10px] text-gray-600">views</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function StoriesPage() {
  const router = useRouter()
  const [media, setMedia] = useState<MediaItem[]>([])
  const [accounts, setAccounts] = useState<InstagramAccount[]>([])
  const [selectedMedia, setSelectedMedia] = useState<string[]>([])
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([])
  const [showAllMedia, setShowAllMedia] = useState(false)
  const [publishMode, setPublishMode] = useState<PublishMode>("now")
  const [startAt, setStartAt] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 10 * 60 * 1000))
  )
  const [intervalMinutes, setIntervalMinutes] = useState(10)
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch("/api/library", { cache: "no-store" }).then(async (response) => {
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error || "Não foi possível carregar a biblioteca.")
        }
        return Array.isArray(payload) ? (payload as MediaItem[]) : []
      }),
      fetch("/api/instagram/accounts", { cache: "no-store" }).then(
        async (response) => {
          const payload = await response.json()
          if (!response.ok) {
            throw new Error(payload.error || "Não foi possível carregar as contas.")
          }

          return (Array.isArray(payload) ? payload : []).filter(
            (account: InstagramAccount) =>
              account.connectionType === "official" &&
              account.isActive &&
              !account.requiresReconnect
          ) as InstagramAccount[]
        }
      ),
    ])
      .then(([library, accountList]) => {
        setMedia(library)
        setAccounts(accountList)
        setSelectedAccounts(accountList.map((account) => account.id))

        const params = new URLSearchParams(window.location.search)
        const requested = String(params.get("media") || "")
          .split(",")
          .filter(Boolean)
        setSelectedMedia(
          requested
            .filter((id) => library.some((item) => item.id === id))
            .slice(0, 50)
        )
      })
      .catch((loadError) => {
        toast.error(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar os dados.",
          { id: "stories-load-error" }
        )
      })
      .finally(() => setLoading(false))
  }, [])

  const visibleMedia = useMemo(
    () => (showAllMedia ? media : media.slice(0, 3)),
    [media, showAllMedia]
  )

  const selectedItems = useMemo(
    () =>
      selectedMedia
        .map((id) => media.find((item) => item.id === id))
        .filter((item): item is MediaItem => Boolean(item)),
    [media, selectedMedia]
  )

  const timeline = useMemo(() => {
    const first =
      publishMode === "now" ? new Date() : new Date(String(startAt || ""))
    if (Number.isNaN(first.getTime())) return []

    return selectedItems.map((item, index) => ({
      item,
      scheduledAt: new Date(first.getTime() + index * intervalMinutes * 60_000),
    }))
  }, [intervalMinutes, publishMode, selectedItems, startAt])

  function toggleMedia(id: string) {
    setSelectedMedia((current) => {
      if (current.includes(id)) {
        return current.filter((mediaId) => mediaId !== id)
      }
      if (current.length >= 50) return current
      return [...current, id]
    })
  }

  function toggleAllMedia() {
    setSelectedMedia((current) =>
      current.length === Math.min(media.length, 50)
        ? []
        : media.slice(0, 50).map((item) => item.id)
    )
  }

  function moveMedia(index: number, direction: -1 | 1) {
    setSelectedMedia((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current

      const copy = [...current]
      ;[copy[index], copy[target]] = [copy[target], copy[index]]
      return copy
    })
  }

  function toggleAccount(id: string) {
    setSelectedAccounts((current) =>
      current.includes(id)
        ? current.filter((accountId) => accountId !== id)
        : [...current, id]
    )
  }

  async function submit() {
    if (selectedMedia.length === 0) {
      toast.error("Selecione pelo menos uma mídia para o Story.")
      return
    }
    if (selectedAccounts.length === 0) {
      toast.error("Selecione pelo menos uma conta do Instagram.")
      return
    }
    if (publishMode === "scheduled" && !startAt) {
      toast.error("Informe a data e a hora da primeira publicação.")
      return
    }

    setSubmitting(true)

    try {
      const firstPublication =
        publishMode === "now"
          ? new Date(Date.now() + 5_000)
          : new Date(startAt)

      if (Number.isNaN(firstPublication.getTime())) {
        throw new Error("A data da primeira publicação é inválida.")
      }

      const response = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicationType: "story",
          name: name.trim() || "Sequência de Stories",
          mediaIds: selectedMedia,
          accountIds: selectedAccounts,
          startAt: firstPublication.toISOString(),
          intervalMinutes,
          captionMode: "single",
          singleCaption: "",
          singleHashtags: "",
          itemCaptions: [],
          rotationCaptions: [],
          itemCovers: [],
        }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível criar a sequência de Stories.")
      }

      toast.success(
        publishMode === "now"
          ? "Sequência de Stories adicionada à fila de publicação."
          : "Sequência de Stories agendada com sucesso."
      )
      router.push("/dashboard/queue")
    } catch (submitError) {
      toast.error(
        submitError instanceof Error
          ? submitError.message
          : "Não foi possível publicar os Stories."
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={24} className="animate-spin text-purple-400" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Stories</h1>
          <p className="mt-1 text-sm text-gray-500">
            Publique imagens e vídeos em várias contas, imediatamente ou por agendamento.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/dashboard/queue")}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-gray-300 hover:border-purple-500/30 hover:text-white"
        >
          <CalendarClock size={15} /> Ver fila
        </button>
      </div>

      <StoriesPerformance />

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/[0.07] bg-[#111] p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Mídias selecionadas</p>
            <Layers3 size={15} className="text-purple-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{selectedMedia.length}</p>
          <p className="mt-1 text-[11px] text-gray-600">Máximo de 50 por sequência</p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-[#111] p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Contas selecionadas</p>
            <Instagram size={15} className="text-pink-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{selectedAccounts.length}</p>
          <p className="mt-1 text-[11px] text-gray-600">Publicação oficial pela Meta</p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-[#111] p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Modo atual</p>
            {publishMode === "now" ? (
              <Play size={15} className="text-green-400" />
            ) : (
              <Clock3 size={15} className="text-blue-400" />
            )}
          </div>
          <p className="mt-2 text-lg font-bold text-white">
            {publishMode === "now" ? "Publicar agora" : "Agendado"}
          </p>
          <p className="mt-1 text-[11px] text-gray-600">Um Story por mídia e por conta</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          <section className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  1. Escolha e ordene as mídias
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Cada imagem ou vídeo será publicado como um Story separado.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {media.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleAllMedia}
                    className="text-xs font-medium text-gray-400 hover:text-white"
                  >
                    {selectedMedia.length === Math.min(media.length, 50)
                      ? "Limpar"
                      : "Selecionar todas"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => router.push("/dashboard/library")}
                  className="text-xs font-medium text-purple-400 hover:text-purple-300"
                >
                  Abrir biblioteca
                </button>
              </div>
            </div>

            {media.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-10 text-center">
                <Layers3 size={24} className="mx-auto mb-3 text-purple-400" />
                <p className="text-sm text-white">Sua biblioteca está vazia</p>
                <p className="mt-1 text-xs text-gray-500">
                  Adicione imagens ou vídeos antes de criar os Stories.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {visibleMedia.map((item) => {
                  const selected = selectedMedia.includes(item.id)
                  const position = selectedMedia.indexOf(item.id)

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleMedia(item.id)}
                      className={`relative overflow-hidden rounded-xl border text-left transition-colors ${
                        selected
                          ? "border-purple-500/60"
                          : "border-white/[0.07] hover:border-white/20"
                      }`}
                    >
                      <div className="aspect-[9/12] bg-black">
                        {item.type === "video" ? (
                          <video
                            src={item.url}
                            className="h-full w-full object-cover"
                            muted
                            preload="metadata"
                          />
                        ) : (
                          <img
                            src={item.url}
                            alt={item.fileName}
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-2 bg-[#151515] p-2.5">
                        {item.type === "video" ? (
                          <Film size={12} className="text-purple-400" />
                        ) : (
                          <ImageIcon size={12} className="text-pink-400" />
                        )}
                        <span className="truncate text-xs text-gray-300">
                          {item.fileName}
                        </span>
                      </div>
                      {selected && (
                        <span className="absolute left-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-lg bg-purple-500 px-2 text-xs font-bold text-white">
                          {position + 1}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {media.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAllMedia((current) => !current)}
                className="mt-4 flex w-full items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-2.5 text-sm font-medium text-purple-300 hover:border-purple-500/30 hover:bg-purple-500/[0.08]"
              >
                {showAllMedia ? "Retrair" : `Ver todas (${media.length})`}
              </button>
            )}

            {selectedItems.length > 0 && (
              <div className="mt-5 space-y-2">
                <p className="text-xs font-medium text-gray-400">Ordem dos Stories</p>
                {selectedItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-xs font-bold text-purple-300">
                      {index + 1}
                    </span>
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-black">
                      {item.type === "video" ? (
                        <video src={item.url} className="h-full w-full object-cover" muted />
                      ) : (
                        <img src={item.url} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white">{item.fileName}</p>
                      <p className="text-[11px] text-gray-600">
                        {item.type === "video" ? "Story em vídeo" : "Story em imagem"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => moveMedia(index, -1)}
                      disabled={index === 0}
                      className="p-1.5 text-gray-500 hover:text-white disabled:opacity-20"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveMedia(index, 1)}
                      disabled={index === selectedItems.length - 1}
                      className="p-1.5 text-gray-500 hover:text-white disabled:opacity-20"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleMedia(item.id)}
                      className="p-1.5 text-red-400 hover:text-red-300"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>

        <div className="space-y-6 xl:col-span-2">
          <section className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
            <h2 className="mb-4 text-sm font-semibold text-white">
              2. Publicação e contas
            </h2>

            <label className="mb-1.5 block text-xs text-gray-400">
              Nome da sequência <span className="text-gray-600">(opcional)</span>
            </label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Stories da noite"
              className="mb-4 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none"
            />

            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPublishMode("now")}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${
                  publishMode === "now"
                    ? "border-purple-500/40 bg-purple-500/15 text-purple-300"
                    : "border-white/[0.07] bg-white/[0.025] text-gray-500 hover:text-white"
                }`}
              >
                <Play size={14} /> Publicar agora
              </button>
              <button
                type="button"
                onClick={() => setPublishMode("scheduled")}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${
                  publishMode === "scheduled"
                    ? "border-purple-500/40 bg-purple-500/15 text-purple-300"
                    : "border-white/[0.07] bg-white/[0.025] text-gray-500 hover:text-white"
                }`}
              >
                <CalendarClock size={14} /> Agendar
              </button>
            </div>

            {publishMode === "scheduled" && (
              <>
                <label className="mb-1.5 block text-xs text-gray-400">
                  Primeira publicação
                </label>
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(event) => setStartAt(event.target.value)}
                  className="mb-4 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-purple-500 focus:outline-none"
                />
              </>
            )}

            <label className="mb-1.5 block text-xs text-gray-400">
              Intervalo entre Stories
            </label>
            <select
              value={intervalMinutes}
              onChange={(event) => setIntervalMinutes(Number(event.target.value))}
              className="mb-5 w-full rounded-lg border border-white/10 bg-[#171717] px-3 py-2.5 text-sm text-white focus:border-purple-500 focus:outline-none"
            >
              {INTERVAL_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {intervalLabel(minutes)}
                </option>
              ))}
            </select>

            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs text-gray-400">Contas</label>
              <button
                type="button"
                onClick={() =>
                  setSelectedAccounts(
                    selectedAccounts.length === accounts.length
                      ? []
                      : accounts.map((account) => account.id)
                  )
                }
                className="text-xs text-purple-400 hover:text-purple-300"
              >
                {selectedAccounts.length === accounts.length ? "Limpar" : "Todas"}
              </button>
            </div>

            {accounts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-6 text-center">
                <Instagram size={22} className="mx-auto mb-3 text-purple-400" />
                <p className="text-sm text-white">Nenhuma conta oficial disponível</p>
                <p className="mt-1 text-xs text-gray-500">
                  Conecte uma conta profissional pelo App Meta.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {accounts.map((account) => {
                  const selected = selectedAccounts.includes(account.id)
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => toggleAccount(account.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${
                        selected
                          ? "border-purple-500/35 bg-purple-500/10"
                          : "border-white/[0.07] bg-white/[0.025]"
                      }`}
                    >
                      {account.profilePicture ? (
                        <img
                          src={account.profilePicture}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500">
                          <Instagram size={13} />
                        </div>
                      )}
                      <span className="text-sm text-white">@{account.username}</span>
                      {selected && (
                        <CheckCircle2 size={15} className="ml-auto text-purple-400" />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles size={16} className="text-purple-400" />
              <h2 className="text-sm font-semibold text-white">Prévia da sequência</h2>
            </div>

            {timeline.length === 0 ? (
              <p className="text-sm text-gray-500">
                Selecione mídias para visualizar a ordem e os horários.
              </p>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {timeline.map(({ item, scheduledAt }, index) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.07] p-3"
                  >
                    <span className="text-xs font-bold text-purple-300">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {item.type === "video" ? (
                          <Film size={12} className="text-purple-400" />
                        ) : (
                          <ImageIcon size={12} className="text-pink-400" />
                        )}
                        <p className="truncate text-xs font-medium text-white">
                          {item.fileName}
                        </p>
                      </div>
                      <p className="mt-1 text-[11px] text-gray-500">
                        {publishMode === "now" && index === 0
                          ? "Assim que a fila processar"
                          : formatSchedule(scheduledAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 rounded-xl border border-blue-500/15 bg-blue-500/5 p-3 text-xs leading-5 text-blue-200/80">
              O primeiro Story em “Publicar agora” é enviado imediatamente. Os próximos respeitam
              o intervalo escolhido e continuam sendo processados automaticamente pela fila.
            </div>
          </section>

          <button
            type="button"
            onClick={submit}
            disabled={
              submitting || selectedMedia.length === 0 || selectedAccounts.length === 0
            }
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 py-3 font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : publishMode === "now" ? (
              <Play size={16} />
            ) : (
              <CalendarClock size={16} />
            )}
            {submitting
              ? "Preparando Stories..."
              : publishMode === "now"
                ? `Publicar ${selectedMedia.length} Story(s)`
                : `Agendar ${selectedMedia.length} Story(s)`}
          </button>
        </div>
      </div>
    </div>
  )
}
