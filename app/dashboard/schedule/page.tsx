"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CheckCircle2,
  Film,
  ImageIcon,
  Instagram,
  Layers3,
  Loader2,
  Plus,
  RotateCcw,
  Shuffle,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import toast from "react-hot-toast"
import { uploadFileToR2 } from "@/lib/r2-upload"

type MediaItem = {
  id: string
  url: string
  type: "image" | "video"
  fileName: string
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

type CaptionDraft = {
  caption: string
  hashtags: string
}

type CoverUpload = {
  file: File
  preview: string
}

const INTERVAL_OPTIONS = [5, 10, 15, 30, 60, 120, 360, 720, 1440]
const IMAGE_LIMIT = 8 * 1024 * 1024

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

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function SchedulePage() {
  const router = useRouter()
  const [media, setMedia] = useState<MediaItem[]>([])
  const [accounts, setAccounts] = useState<InstagramAccount[]>([])
  const [selectedMedia, setSelectedMedia] = useState<string[]>([])
  const [showAllMedia, setShowAllMedia] = useState(false)
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([])
  const [startAt, setStartAt] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 10 * 60 * 1000))
  )
  const [intervalMinutes, setIntervalMinutes] = useState(10)
  const [captionMode, setCaptionMode] = useState<"single" | "per_media" | "rotate">("single")
  const [singleCaption, setSingleCaption] = useState("")
  const [singleHashtags, setSingleHashtags] = useState("")
  const [perMedia, setPerMedia] = useState<Record<string, CaptionDraft>>({})
  const [rotationCaptions, setRotationCaptions] = useState<CaptionDraft[]>([
    { caption: "", hashtags: "" },
  ])
  const [coverMode, setCoverMode] = useState<"none" | "single" | "per_video">("none")
  const [sharedCover, setSharedCover] = useState<CoverUpload | null>(null)
  const [perVideoCovers, setPerVideoCovers] = useState<Record<string, CoverUpload>>({})
  const sharedCoverRef = useRef<CoverUpload | null>(null)
  const perVideoCoversRef = useRef<Record<string, CoverUpload>>({})
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [randomMode, setRandomMode] = useState(false)
  const [randomCount, setRandomCount] = useState(1)

  useEffect(() => {
    Promise.all([
      fetch("/api/library", { cache: "no-store" }).then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Erro ao carregar a biblioteca")
        return Array.isArray(data) ? (data as MediaItem[]) : []
      }),
      fetch("/api/instagram/accounts", { cache: "no-store" }).then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Erro ao carregar as contas")
        return (Array.isArray(data) ? data : []).filter(
          (account: InstagramAccount) =>
            account.connectionType === "official" &&
            account.isActive &&
            !account.requiresReconnect
        ) as InstagramAccount[]
      }),
    ])
      .then(([library, accountList]) => {
        setMedia(library)
        setAccounts(accountList)
        setSelectedAccounts(accountList.map((account) => account.id))

        const params = new URLSearchParams(window.location.search)
        const requested = String(params.get("media") || "")
          .split(",")
          .filter(Boolean)
        const existing = requested.filter((id) => library.some((item) => item.id === id))
        setSelectedMedia(existing)
      })
      .catch((requestError) =>
        toast.error(
          requestError instanceof Error ? requestError.message : "Erro ao carregar dados",
          { id: "schedule-load-error" }
        )
      )
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    sharedCoverRef.current = sharedCover
  }, [sharedCover])

  useEffect(() => {
    perVideoCoversRef.current = perVideoCovers
  }, [perVideoCovers])

  useEffect(() => {
    return () => {
      if (sharedCoverRef.current?.preview) {
        URL.revokeObjectURL(sharedCoverRef.current.preview)
      }
      Object.values(perVideoCoversRef.current).forEach((item) => {
        URL.revokeObjectURL(item.preview)
      })
    }
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

  const videoItems = useMemo(
    () => selectedItems.filter((item) => item.type === "video"),
    [selectedItems]
  )

  useEffect(() => {
    setPerVideoCovers((current) => {
      const allowedIds = new Set(videoItems.map((item) => item.id))
      let changed = false
      const next: Record<string, CoverUpload> = {}

      Object.entries(current).forEach(([mediaId, upload]) => {
        if (allowedIds.has(mediaId)) {
          next[mediaId] = upload
        } else {
          changed = true
          URL.revokeObjectURL(upload.preview)
        }
      })

      return changed ? next : current
    })

    if (videoItems.length === 0) {
      setCoverMode("none")
      if (sharedCover) {
        URL.revokeObjectURL(sharedCover.preview)
        setSharedCover(null)
      }
    }
  }, [sharedCover, videoItems])

  const timeline = useMemo(() => {
    const first = new Date(startAt)
    if (Number.isNaN(first.getTime())) return []
    const items = randomMode
      ? Array.from({ length: randomCount }, (_, i) => ({
          id: `random-${i}`,
          url: "",
          type: "video" as const,
          fileName: `Vídeo aleatório ${i + 1}`,
          createdAt: "",
        }))
      : selectedItems
    return items.map((item, index) => ({
      item,
      scheduledAt: new Date(first.getTime() + index * intervalMinutes * 60_000),
    }))
  }, [intervalMinutes, selectedItems, startAt, randomMode, randomCount])

  const toggleMedia = (id: string) => {
    setSelectedMedia((current) =>
      current.includes(id)
        ? current.filter((itemId) => itemId !== id)
        : current.length >= 50
          ? current
          : [...current, id]
    )
  }

  const moveMedia = (index: number, direction: -1 | 1) => {
    setSelectedMedia((current) => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= current.length) return current
      const copy = [...current]
      ;[copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]]
      return copy
    })
  }

  const toggleAccount = (id: string) => {
    setSelectedAccounts((current) =>
      current.includes(id) ? current.filter((accountId) => accountId !== id) : [...current, id]
    )
  }

  const updatePerMedia = (mediaId: string, field: keyof CaptionDraft, value: string) => {
    setPerMedia((current) => ({
      ...current,
      [mediaId]: {
        caption: current[mediaId]?.caption || "",
        hashtags: current[mediaId]?.hashtags || "",
        [field]: value,
      },
    }))
  }

  const updateRotation = (index: number, field: keyof CaptionDraft, value: string) => {
    setRotationCaptions((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry
      )
    )
  }

  const validateCoverFile = (file: File) => {
    if (file.type !== "image/jpeg") {
      throw new Error("A capa do Reel precisa ser uma imagem JPEG.")
    }
    if (file.size > IMAGE_LIMIT) {
      throw new Error("A capa do Reel pode ter no máximo 8 MB.")
    }
  }

  const uploadCover = async (file: File) => {
    const uploaded = await uploadFileToR2(file)
    return uploaded.publicUrl
  }

  const handleSharedCoverChange = (file: File | null) => {
    try {
      if (file) validateCoverFile(file)
      setSharedCover((current) => {
        if (current?.preview) URL.revokeObjectURL(current.preview)
        return file ? { file, preview: URL.createObjectURL(file) } : null
      })
    } catch (coverError) {
      toast.error(
        coverError instanceof Error ? coverError.message : "Não foi possível usar esta capa."
      )
    }
  }

  const handlePerVideoCoverChange = (mediaId: string, file: File | null) => {
    try {
      if (file) validateCoverFile(file)
      setPerVideoCovers((current) => {
        const existing = current[mediaId]
        if (existing?.preview) URL.revokeObjectURL(existing.preview)
        const next = { ...current }
        if (file) {
          next[mediaId] = { file, preview: URL.createObjectURL(file) }
        } else {
          delete next[mediaId]
        }
        return next
      })
    } catch (coverError) {
      toast.error(
        coverError instanceof Error ? coverError.message : "Não foi possível usar esta capa."
      )
    }
  }

  const submitRandom = async () => {
    if (selectedAccounts.length === 0) return toast.error("Selecione pelo menos uma conta.")
    if (!startAt) return toast.error("Informe quando a sequência deve começar.")

    const videos = media.filter((m) => m.type === "video")
    if (videos.length === 0) return toast.error("Nenhum vídeo na biblioteca para sortear.")

    setSubmitting(true)
    try {
      const randomMediaIds = Array.from({ length: randomCount }, () => {
        const random = videos[Math.floor(Math.random() * videos.length)]
        return random.id
      })

      const response = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || "Automação aleatória",
          mediaIds: randomMediaIds,
          accountIds: selectedAccounts,
          startAt: new Date(startAt).toISOString(),
          intervalMinutes,
          captionMode,
          singleCaption,
          singleHashtags,
          itemCaptions: randomMediaIds.map((mediaId) => ({
            mediaId,
            caption: singleCaption,
            hashtags: singleHashtags,
          })),
          rotationCaptions,
          itemCovers: [],
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Não foi possível criar a automação")
      toast.success("Automação aleatória criada com sucesso.")
      router.push("/dashboard/queue")
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : "Não foi possível criar a automação")
    } finally {
      setSubmitting(false)
    }
  }

  const submit = async () => {
    if (randomMode) return submitRandom()

    if (selectedMedia.length === 0) return toast.error("Selecione pelo menos uma mídia.")
    if (selectedAccounts.length === 0) return toast.error("Selecione pelo menos uma conta.")
    if (!startAt) return toast.error("Informe quando a sequência deve começar.")

    if (videoItems.length > 0) {
      if (coverMode === "single" && !sharedCover) {
        return toast.error("Adicione a capa compartilhada para os vídeos.")
      }
      if (coverMode === "per_video" && videoItems.some((item) => !perVideoCovers[item.id])) {
        return toast.error("Adicione uma capa para cada vídeo selecionado.")
      }
    }

    setSubmitting(true)
    try {
      const itemCovers: Array<{ mediaId: string; coverUrl: string }> = []

      if (videoItems.length > 0 && coverMode !== "none") {
        if (coverMode === "single" && sharedCover) {
          const sharedUrl = await uploadCover(sharedCover.file)
          videoItems.forEach((item) => {
            itemCovers.push({ mediaId: item.id, coverUrl: sharedUrl })
          })
        }

        if (coverMode === "per_video") {
          const uploaded = await Promise.all(
            videoItems.map(async (item) => {
              const entry = perVideoCovers[item.id]
              if (!entry) throw new Error(`Adicione uma capa para ${item.fileName}.`)
              const coverUrl = await uploadCover(entry.file)
              return { mediaId: item.id, coverUrl }
            })
          )
          itemCovers.push(...uploaded)
        }
      }

      const response = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mediaIds: selectedMedia,
          accountIds: selectedAccounts,
          startAt: new Date(startAt).toISOString(),
          intervalMinutes,
          captionMode,
          singleCaption,
          singleHashtags,
          itemCaptions: selectedMedia.map((mediaId) => ({
            mediaId,
            caption: perMedia[mediaId]?.caption || "",
            hashtags: perMedia[mediaId]?.hashtags || "",
          })),
          rotationCaptions,
          itemCovers,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Não foi possível criar a automação")
      toast.success("Automação criada com sucesso.")
      router.push("/dashboard/queue")
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : "Não foi possível criar a automação")
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
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Automação de posts</h1>
          <p className="mt-1 text-sm text-gray-500">
            Monte uma sequência de mídias, legendas, capas e intervalos para publicar automaticamente.
          </p>
        </div>
        <button
          onClick={() => setRandomMode(!randomMode)}
          className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
            randomMode
              ? "border-green-500/30 bg-green-500/15 text-green-300"
              : "border-white/10 bg-white/5 text-gray-400 hover:text-white"
          }`}
        >
          <Shuffle size={15} />
          {randomMode ? "Modo aleatório ativo" : "Ativar modo aleatório"}
        </button>
      </div>

      {randomMode && (
        <div className="mb-6 rounded-2xl border border-green-500/20 bg-green-500/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shuffle size={16} className="text-green-400" />
            <h2 className="text-sm font-semibold text-white">Modo aleatório</h2>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            Cada publicação usará um vídeo diferente sorteado da sua biblioteca. Ideal para evitar detecção de conteúdo repetido.
          </p>
          <div>
            <label className="mb-1.5 block text-xs text-gray-400">Quantos vídeos sortear?</label>
            <input
              type="number"
              min={1}
              max={50}
              value={randomCount}
              onChange={(e) => setRandomCount(Math.min(50, Math.max(1, Number(e.target.value))))}
              className="w-32 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-green-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-600">
              {media.filter(m => m.type === "video").length} vídeo(s) disponíveis na biblioteca
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          {!randomMode && (
            <>
              <section className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white">1. Escolha e ordene as mídias</h2>
                    <p className="mt-1 text-xs text-gray-500">Até 50 imagens ou vídeos da biblioteca.</p>
                  </div>
                  <button
                    onClick={() => router.push("/dashboard/library")}
                    className="text-xs font-medium text-purple-400 hover:text-purple-300"
                  >
                    Abrir biblioteca
                  </button>
                </div>

                {media.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 p-10 text-center">
                    <Layers3 size={24} className="mx-auto mb-3 text-purple-400" />
                    <p className="text-sm text-white">Sua biblioteca está vazia</p>
                    <p className="mt-1 text-xs text-gray-500">Adicione arquivos antes de criar a sequência.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {visibleMedia.map((item) => {
                      const selected = selectedMedia.includes(item.id)
                      const position = selectedMedia.indexOf(item.id)
                      return (
                        <button
                          key={item.id}
                          onClick={() => toggleMedia(item.id)}
                          className={`relative overflow-hidden rounded-xl border text-left ${
                            selected ? "border-purple-500/60" : "border-white/[0.07] hover:border-white/20"
                          }`}
                        >
                          <div className="aspect-square bg-black">
                            {item.type === "video" ? (
                              <video src={item.url} className="h-full w-full object-cover" muted preload="metadata" />
                            ) : (
                              <img src={item.url} alt={item.fileName} className="h-full w-full object-cover" />
                            )}
                          </div>
                          <div className="flex items-center gap-2 bg-[#151515] p-2.5">
                            {item.type === "video" ? <Film size={12} className="text-purple-400" /> : <ImageIcon size={12} className="text-pink-400" />}
                            <span className="truncate text-xs text-gray-300">{item.fileName}</span>
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
                    className="mt-4 flex w-full items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-2.5 text-sm font-medium text-purple-300 transition-colors hover:border-purple-500/30 hover:bg-purple-500/[0.08]"
                  >
                    {showAllMedia ? "Retrair" : `Ver todas (${media.length})`}
                  </button>
                )}

                {selectedItems.length > 0 && (
                  <div className="mt-5 space-y-2">
                    <p className="text-xs font-medium text-gray-400">Ordem da sequência</p>
                    {selectedItems.map((item, index) => (
                      <div key={item.id} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-xs font-bold text-purple-300">
                          {index + 1}
                        </span>
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-black">
                          {item.type === "video" ? <video src={item.url} className="h-full w-full object-cover" muted /> : <img src={item.url} alt="" className="h-full w-full object-cover" />}
                        </div>
                        <span className="min-w-0 flex-1 truncate text-sm text-white">{item.fileName}</span>
                        <button onClick={() => moveMedia(index, -1)} disabled={index === 0} className="p-1.5 text-gray-500 hover:text-white disabled:opacity-20"><ArrowUp size={14} /></button>
                        <button onClick={() => moveMedia(index, 1)} disabled={index === selectedItems.length - 1} className="p-1.5 text-gray-500 hover:text-white disabled:opacity-20"><ArrowDown size={14} /></button>
                        <button onClick={() => toggleMedia(item.id)} className="p-1.5 text-red-400 hover:text-red-300"><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
                <h2 className="mb-4 text-sm font-semibold text-white">2. Capa dos vídeos</h2>
                {videoItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 p-6 text-center">
                    <ImageIcon size={22} className="mx-auto mb-3 text-purple-400" />
                    <p className="text-sm text-white">Adicione vídeos para usar capa personalizada</p>
                    <p className="mt-1 text-xs text-gray-500">As capas se aplicam apenas aos Reels da automação.</p>
                  </div>
                ) : (
                  <>
                    <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {([["none", "Sem capa"], ["single", "Uma para todos"], ["per_video", "Uma por vídeo"]] as const).map(([value, label]) => (
                        <button key={value} onClick={() => setCoverMode(value)} className={`rounded-xl border px-3 py-2.5 text-sm ${coverMode === value ? "border-purple-500/40 bg-purple-500/15 text-purple-300" : "border-white/[0.07] bg-white/[0.025] text-gray-500 hover:text-white"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {coverMode === "none" && <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 text-sm text-gray-400">Os vídeos serão publicados sem capa personalizada.</div>}
                    {coverMode === "single" && <CoverPicker inputId="shared-cover" label="Capa compartilhada" description="A mesma capa será aplicada em todos os vídeos desta automação." file={sharedCover?.file || null} preview={sharedCover?.preview || null} onChange={handleSharedCoverChange} />}
                    {coverMode === "per_video" && (
                      <div className="space-y-4">
                        {videoItems.map((item, index) => (
                          <div key={item.id} className="rounded-xl border border-white/[0.07] p-4">
                            <div className="mb-3 flex items-center gap-3">
                              <div className="h-12 w-12 overflow-hidden rounded-lg bg-black"><video src={item.url} className="h-full w-full object-cover" muted /></div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-white">{index + 1}. {item.fileName}</p>
                                <p className="text-xs text-gray-500">Defina a capa específica deste Reel.</p>
                              </div>
                            </div>
                            <CoverPicker inputId={`cover-${item.id}`} label="Capa do Reel" file={perVideoCovers[item.id]?.file || null} preview={perVideoCovers[item.id]?.preview || null} onChange={(file) => handlePerVideoCoverChange(item.id, file)} />
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </section>
            </>
          )}

          <section className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
            <h2 className="mb-4 text-sm font-semibold text-white">{randomMode ? "2." : "3."} Configure as legendas</h2>
            <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([["single", "Uma para todas"], ["per_media", "Uma por mídia"], ["rotate", "Alternar lista"]] as const).map(([value, label]) => (
                <button key={value} onClick={() => setCaptionMode(value)} className={`rounded-xl border px-3 py-2.5 text-sm ${captionMode === value ? "border-purple-500/40 bg-purple-500/15 text-purple-300" : "border-white/[0.07] bg-white/[0.025] text-gray-500 hover:text-white"}`}>
                  {label}
                </button>
              ))}
            </div>
            {captionMode === "single" && <CaptionFields value={{ caption: singleCaption, hashtags: singleHashtags }} onChange={(field, value) => field === "caption" ? setSingleCaption(value) : setSingleHashtags(value)} />}
            {captionMode === "per_media" && !randomMode && (
              <div className="space-y-4">
                {selectedItems.length === 0 ? <p className="text-sm text-gray-500">Selecione as mídias primeiro.</p> : selectedItems.map((item, index) => (
                  <div key={item.id} className="rounded-xl border border-white/[0.07] p-4">
                    <p className="mb-3 text-xs font-semibold text-white">{index + 1}. {item.fileName}</p>
                    <CaptionFields value={perMedia[item.id] || { caption: "", hashtags: "" }} onChange={(field, value) => updatePerMedia(item.id, field, value)} />
                  </div>
                ))}
              </div>
            )}
            {captionMode === "rotate" && (
              <div className="space-y-4">
                {rotationCaptions.map((entry, index) => (
                  <div key={index} className="rounded-xl border border-white/[0.07] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-semibold text-white">Legenda {index + 1}</p>
                      {rotationCaptions.length > 1 && <button onClick={() => setRotationCaptions((current) => current.filter((_, i) => i !== index))} className="text-red-400 hover:text-red-300"><Trash2 size={14} /></button>}
                    </div>
                    <CaptionFields value={entry} onChange={(field, value) => updateRotation(index, field, value)} />
                  </div>
                ))}
                <button onClick={() => setRotationCaptions((current) => [...current, { caption: "", hashtags: "" }])} className="flex items-center gap-2 text-sm font-medium text-purple-400 hover:text-purple-300">
                  <Plus size={14} /> Adicionar outra legenda
                </button>
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6 xl:col-span-2">
          <section className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
            <h2 className="mb-4 text-sm font-semibold text-white">{randomMode ? "3." : "4."} Contas e intervalo</h2>
            <label className="mb-1.5 block text-xs text-gray-400">Nome da automação <span className="text-gray-600">(opcional)</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Conteúdo da semana" className="mb-4 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none" />
            <label className="mb-1.5 block text-xs text-gray-400">Primeira publicação</label>
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="mb-4 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-purple-500 focus:outline-none" />
            <label className="mb-1.5 block text-xs text-gray-400">Intervalo entre mídias</label>
            <select value={intervalMinutes} onChange={(e) => setIntervalMinutes(Number(e.target.value))} className="mb-5 w-full rounded-lg border border-white/10 bg-[#171717] px-3 py-2.5 text-sm text-white focus:border-purple-500 focus:outline-none">
              {INTERVAL_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes < 60 ? `${minutes} minutos` : minutes === 60 ? "1 hora" : minutes < 1440 ? `${minutes / 60} horas` : "24 horas"}
                </option>
              ))}
            </select>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs text-gray-400">Contas</label>
              <button onClick={() => setSelectedAccounts(selectedAccounts.length === accounts.length ? [] : accounts.map((a) => a.id))} className="text-xs text-purple-400 hover:text-purple-300">
                {selectedAccounts.length === accounts.length ? "Limpar" : "Todas"}
              </button>
            </div>
            <div className="space-y-2">
              {accounts.map((account) => {
                const selected = selectedAccounts.includes(account.id)
                return (
                  <button key={account.id} onClick={() => toggleAccount(account.id)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${selected ? "border-purple-500/35 bg-purple-500/10" : "border-white/[0.07] bg-white/[0.025]"}`}>
                    {account.profilePicture ? <img src={account.profilePicture} alt="" className="h-8 w-8 rounded-full object-cover" /> : <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500"><Instagram size={13} /></div>}
                    <span className="text-sm text-white">@{account.username}</span>
                    {selected && <CheckCircle2 size={15} className="ml-auto text-purple-400" />}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
            <div className="mb-4 flex items-center gap-2">
              <CalendarClock size={16} className="text-purple-400" />
              <h2 className="text-sm font-semibold text-white">Prévia da fila</h2>
            </div>
            {timeline.length === 0 ? (
              <p className="text-sm text-gray-500">Selecione mídias para visualizar os horários.</p>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {timeline.map(({ item, scheduledAt }, index) => (
                  <div key={item.id} className="flex items-center gap-3 rounded-xl border border-white/[0.07] p-3">
                    <span className="text-xs font-bold text-purple-300">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-white">{item.fileName}</p>
                      <p className="mt-0.5 text-[11px] text-gray-500">{formatSchedule(scheduledAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 rounded-xl border border-blue-500/15 bg-blue-500/5 p-3 text-xs leading-5 text-blue-200/80">
              O executor verifica a fila a cada 5 minutos. Uma publicação atrasada será processada na próxima verificação, sem perder a ordem.
            </div>
          </section>

          <button
            onClick={submit}
            disabled={submitting || (!randomMode && (selectedMedia.length === 0 || selectedAccounts.length === 0)) || (randomMode && selectedAccounts.length === 0)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 py-3 font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : randomMode ? <Shuffle size={16} /> : <RotateCcw size={16} />}
            {submitting ? "Criando automação..." : randomMode ? `Agendar ${randomCount} vídeo(s) aleatório(s)` : `Agendar ${selectedMedia.length} mídia(s)`}
          </button>
        </div>
      </div>
    </div>
  )
}

function CaptionFields({ value, onChange }: { value: CaptionDraft; onChange: (field: keyof CaptionDraft, value: string) => void }) {
  return (
    <div className="space-y-3">
      <textarea value={value.caption} onChange={(e) => onChange("caption", e.target.value)} placeholder="Legenda da publicação..." rows={4} className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none" />
      <input value={value.hashtags} onChange={(e) => onChange("hashtags", e.target.value)} placeholder="#hashtag1 #hashtag2" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none" />
    </div>
  )
}

function CoverPicker({ inputId, label, description, file, preview, onChange }: { inputId: string; label: string; description?: string; file: File | null; preview: string | null; onChange: (file: File | null) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs text-gray-400">{label}</label>
      {description ? <p className="mb-3 text-xs text-gray-500">{description}</p> : null}
      <input type="file" accept="image/jpeg" className="hidden" id={inputId} onChange={(e) => { onChange(e.target.files?.[0] || null); e.currentTarget.value = "" }} />
      {file && preview ? (
        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
          <img src={preview} alt="capa" className="h-10 w-10 rounded object-cover" />
          <span className="min-w-0 flex-1 truncate text-sm text-white">{file.name}</span>
          <span className="text-xs text-gray-500">{formatSize(file.size)}</span>
          <button onClick={() => onChange(null)}><X size={14} className="text-gray-500 hover:text-white" /></button>
        </div>
      ) : (
        <label htmlFor={inputId} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-yellow-500/20 bg-white/5 px-3 py-4 text-sm text-gray-500 transition-colors hover:border-yellow-500/50 hover:text-white">
          <Upload size={15} /> Clique para adicionar a capa
        </label>
      )}
    </div>
  )
}
