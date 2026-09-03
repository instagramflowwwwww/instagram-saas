"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Film,
  Folder,
  FolderOpen,
  FolderPlus,
  ImageIcon,
  Layers3,
  Loader2,
  Move,
  Pencil,
  Play,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import toast from "react-hot-toast"
import { uploadFileToR2 } from "@/lib/r2-upload"
import { extractVideoFrames } from "@/lib/video-frames"
import { confirmToast } from "@/lib/toast"

type MediaItem = {
  id: string
  folderId: string | null
  url: string
  type: "image" | "video"
  fileName: string
  bytes: number | null
  width: number | null
  height: number | null
  duration: number | null
  format: string | null
  createdAt: string
}

type GeneratedCaption = {
  caption: string
  hashtags: string
  description: string
}

type MediaFolder = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  _count: { media: number }
}

type FolderEditor =
  | { mode: "create"; name: string }
  | { mode: "rename"; id: string; name: string }
  | null

const IMAGE_LIMIT = 8 * 1024 * 1024
const VIDEO_LIMIT = 200 * 1024 * 1024

function formatBytes(value: number | null) {
  if (!value) return "—"
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export default function LibraryPage() {
  const router = useRouter()
  const [media, setMedia] = useState<MediaItem[]>([])
  const [folders, setFolders] = useState<MediaFolder[]>([])
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [captionFor, setCaptionFor] = useState<MediaItem | null>(null)
  const [captionContext, setCaptionContext] = useState("")
  const [captionLoading, setCaptionLoading] = useState(false)
  const [captionStep, setCaptionStep] = useState("")
  const [captionResult, setCaptionResult] = useState<GeneratedCaption | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [moving, setMoving] = useState(false)
  const [folderSaving, setFolderSaving] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [filter, setFilter] = useState<"all" | "video" | "image">("all")
  const [folderEditor, setFolderEditor] = useState<FolderEditor>(null)
  const [moveOpen, setMoveOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchLibrary = async () => {
    try {
      const [mediaResponse, foldersResponse] = await Promise.all([
        fetch("/api/library", { cache: "no-store" }),
        fetch("/api/library/folders", { cache: "no-store" }),
      ])
      const [mediaData, foldersData] = await Promise.all([
        mediaResponse.json(),
        foldersResponse.json(),
      ])

      if (!mediaResponse.ok) {
        throw new Error(mediaData.error || "Erro ao carregar a biblioteca")
      }
      if (!foldersResponse.ok) {
        throw new Error(foldersData.error || "Erro ao carregar as pastas")
      }

      setMedia(Array.isArray(mediaData) ? mediaData : [])
      setFolders(Array.isArray(foldersData) ? foldersData : [])
    } catch (requestError) {
      toast.error(
        requestError instanceof Error ? requestError.message : "Erro ao carregar a biblioteca",
        { id: "library-load-error" }
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLibrary()
  }, [])

  const activeFolder = useMemo(
    () => folders.find((folder) => folder.id === activeFolderId) || null,
    [activeFolderId, folders]
  )

  const currentMedia = useMemo(
    () => media.filter((item) => item.folderId === activeFolderId),
    [activeFolderId, media]
  )

  const filtered = useMemo(
    () => (filter === "all" ? currentMedia : currentMedia.filter((item) => item.type === filter)),
    [currentMedia, filter]
  )

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((item) => selected.includes(item.id))

  const validateFile = (file: File) => {
    if (file.type.startsWith("image/")) {
      if (file.type !== "image/jpeg") {
        throw new Error(`${file.name}: use uma imagem JPEG para publicar pela API oficial.`)
      }
      if (file.size > IMAGE_LIMIT) {
        throw new Error(`${file.name}: a imagem pode ter no máximo 8 MB.`)
      }
      return "image" as const
    }

    if (["video/mp4", "video/quicktime"].includes(file.type)) {
      if (file.size > VIDEO_LIMIT) {
        throw new Error(`${file.name}: o vídeo pode ter no máximo 200 MB.`)
      }
      return "video" as const
    }

    throw new Error(`${file.name}: formato não suportado.`)
  }

  const generateCaption = async (item: MediaItem) => {
    setCaptionLoading(true)
    setCaptionResult(null)
    try {
      setCaptionStep("Lendo o vídeo...")
      const frames = await extractVideoFrames(item.url, 4)

      setCaptionStep("A IA está escrevendo...")
      const response = await fetch("/api/ai/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames, context: captionContext }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Não foi possível gerar a legenda.")

      setCaptionResult(data as GeneratedCaption)
    } catch (captionError) {
      toast.error(
        captionError instanceof Error ? captionError.message : "Não foi possível gerar a legenda."
      )
    } finally {
      setCaptionLoading(false)
      setCaptionStep("")
    }
  }

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return
    setUploading(true)
    const toastId = toast.loading(`Enviando 1 de ${files.length}...`)

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]
        const type = validateFile(file)
        toast.loading(`Enviando ${index + 1} de ${files.length}: ${file.name}`, { id: toastId })

        const uploaded = await uploadFileToR2(file)
        const saveResponse = await fetch("/api/library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            objectKey: uploaded.objectKey,
            type,
            fileName: file.name,
            folderId: activeFolderId,
            bytes: file.size,
            format: file.name.split(".").pop()?.toLowerCase() || null,
          }),
        })
        const saved = await saveResponse.json()
        if (!saveResponse.ok) throw new Error(saved.error || "Falha ao salvar a mídia")
      }

      await fetchLibrary()
      toast.success(
        `${files.length} arquivo${files.length === 1 ? "" : "s"} enviado${files.length === 1 ? "" : "s"} com sucesso.`,
        { id: toastId }
      )
    } catch (uploadError) {
      toast.error(
        uploadError instanceof Error ? uploadError.message : "Erro ao enviar arquivos",
        { id: toastId }
      )
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const deleteMedia = async (ids: string[]) => {
    if (ids.length === 0) return
    const confirmed = await confirmToast(
      `Apagar ${ids.length} arquivo(s) da biblioteca e do armazenamento?`,
      { confirmLabel: "Apagar", danger: true }
    )
    if (!confirmed) return

    setDeleting(true)
    try {
      const response = await fetch("/api/library", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Não foi possível apagar")
      setSelected((current) => current.filter((id) => !ids.includes(id)))
      await fetchLibrary()
      toast.success(`${ids.length} arquivo${ids.length === 1 ? "" : "s"} apagado${ids.length === 1 ? "" : "s"}.`)
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Não foi possível apagar")
    } finally {
      setDeleting(false)
    }
  }

  const saveFolder = async () => {
    if (!folderEditor) return
    if (!folderEditor.name.trim()) {
      toast.error("Informe o nome da pasta.")
      return
    }
    setFolderSaving(true)

    try {
      const isRename = folderEditor.mode === "rename"
      const response = await fetch("/api/library/folders", {
        method: isRename ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isRename
            ? { id: folderEditor.id, name: folderEditor.name }
            : { name: folderEditor.name }
        ),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar a pasta")
      setFolderEditor(null)
      await fetchLibrary()
      toast.success(isRename ? "Pasta renomeada." : "Pasta criada.")
    } catch (folderError) {
      toast.error(folderError instanceof Error ? folderError.message : "Não foi possível salvar a pasta")
    } finally {
      setFolderSaving(false)
    }
  }

  const deleteFolder = async (folder: MediaFolder) => {
    const message =
      folder._count.media > 0
        ? `Apagar a pasta “${folder.name}”? As ${folder._count.media} mídia(s) voltarão para a Biblioteca e não serão excluídas.`
        : `Apagar a pasta “${folder.name}”?`
    const confirmed = await confirmToast(message, { confirmLabel: "Apagar", danger: true })
    if (!confirmed) return

    try {
      const response = await fetch("/api/library/folders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: folder.id }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Não foi possível apagar a pasta")
      if (activeFolderId === folder.id) {
        setActiveFolderId(null)
        setSelected([])
      }
      await fetchLibrary()
      toast.success("Pasta apagada.")
    } catch (folderError) {
      toast.error(folderError instanceof Error ? folderError.message : "Não foi possível apagar a pasta")
    }
  }

  const moveSelected = async (folderId: string | null) => {
    if (selected.length === 0) return
    setMoving(true)

    try {
      const response = await fetch("/api/library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected, folderId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Não foi possível mover os arquivos")
      setSelected([])
      setMoveOpen(false)
      await fetchLibrary()
      toast.success("Mídias movidas com sucesso.")
    } catch (moveError) {
      toast.error(moveError instanceof Error ? moveError.message : "Não foi possível mover os arquivos")
    } finally {
      setMoving(false)
    }
  }

  const toggleSelected = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]
    )
  }

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Link copiado.")
    } catch {
      toast.error("Não foi possível copiar o link.")
    }
  }

  const openFolder = (folderId: string | null) => {
    setActiveFolderId(folderId)
    setSelected([])
    setFilter("all")
  }

  const startAutomation = () => {
    const params = new URLSearchParams({ media: selected.join(",") })
    router.push(`/dashboard/schedule?${params.toString()}`)
  }

  const uncategorizedCount = media.filter((item) => item.folderId === null).length

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Biblioteca</h1>
          <p className="mt-1 text-sm text-gray-500">
            {activeFolder
              ? `${currentMedia.length} arquivo${currentMedia.length !== 1 ? "s" : ""} em ${activeFolder.name}`
              : `${media.length} arquivo${media.length !== 1 ? "s" : ""} salvo${media.length !== 1 ? "s" : ""} • ${folders.length} pasta${folders.length !== 1 ? "s" : ""}`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {selected.length > 0 && (
            <>
              <button
                onClick={() => setMoveOpen(true)}
                className="flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2.5 text-sm font-medium text-gray-200 ring-1 ring-white/10 hover:bg-white/10"
              >
                <Move size={15} /> Mover ({selected.length})
              </button>
              <button
                onClick={startAutomation}
                className="flex items-center gap-2 rounded-lg bg-purple-500/15 px-4 py-2.5 text-sm font-medium text-purple-300 ring-1 ring-purple-500/30 hover:bg-purple-500/20"
              >
                <Layers3 size={15} /> Criar sequência ({selected.length})
              </button>
              <button
                onClick={() => deleteMedia(selected)}
                disabled={deleting}
                className="flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-300 ring-1 ring-red-500/20 hover:bg-red-500/15 disabled:opacity-50"
              >
                {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                Apagar
              </button>
            </>
          )}
          <button
            onClick={() => setFolderEditor({ mode: "create", name: "" })}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-gray-200 hover:bg-white/10"
          >
            <FolderPlus size={15} /> Nova pasta
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/jpeg,video/mp4,video/quicktime"
            className="hidden"
            onChange={(event) => uploadFiles(Array.from(event.target.files || []))}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {uploading ? "Enviando..." : "Adicionar arquivos"}
          </button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
        {activeFolder && (
          <button
            onClick={() => openFolder(null)}
            className="mr-1 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
            title="Voltar para a Biblioteca"
          >
            <ArrowLeft size={15} />
          </button>
        )}
        <button
          onClick={() => openFolder(null)}
          className={`${activeFolder ? "text-gray-500 hover:text-white" : "font-medium text-white"}`}
        >
          Biblioteca
        </button>
        {activeFolder && (
          <>
            <ChevronRight size={14} className="text-gray-700" />
            <span className="font-medium text-white">{activeFolder.name}</span>
          </>
        )}
      </div>

      {!loading && !activeFolder && folders.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-600">Pastas</p>
            <span className="text-xs text-gray-700">{uncategorizedCount} arquivo(s) fora de pastas</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {folders.map((folder) => (
              <div
                key={folder.id}
                className="group flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.07] bg-[#111] p-4 transition-colors hover:border-purple-500/25 hover:bg-[#141414]"
                onClick={() => openFolder(folder.id)}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400">
                  <Folder size={21} fill="currentColor" className="fill-purple-500/15" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{folder.name}</p>
                  <p className="mt-1 text-xs text-gray-600">
                    {folder._count.media} arquivo{folder._count.media !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      setFolderEditor({ mode: "rename", id: folder.id, name: folder.name })
                    }}
                    className="rounded-lg p-2 text-gray-500 hover:bg-white/5 hover:text-white"
                    title="Renomear pasta"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      deleteFolder(folder)
                    }}
                    className="rounded-lg p-2 text-gray-500 hover:bg-red-500/10 hover:text-red-400"
                    title="Apagar pasta"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["all", "video", "image"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-lg border px-4 py-1.5 text-sm transition-colors ${
                filter === value
                  ? "border-purple-500/30 bg-purple-500/20 text-purple-300"
                  : "border-white/5 bg-white/5 text-gray-500 hover:text-white"
              }`}
            >
              {value === "all" ? "Todos" : value === "video" ? "Vídeos" : "Imagens"}
            </button>
          ))}
        </div>
        {filtered.length > 0 && (
          <button
            onClick={() =>
              setSelected((current) =>
                allFilteredSelected
                  ? current.filter((id) => !filtered.some((item) => item.id === id))
                  : Array.from(new Set<string>([...current, ...filtered.map((item) => item.id)]))
              )
            }
            className="text-xs font-medium text-purple-400 hover:text-purple-300"
          >
            {allFilteredSelected ? "Limpar seleção" : "Selecionar todos"}
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="animate-spin text-purple-400" size={24} />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="rounded-2xl border border-white/[0.07] bg-[#111] p-16 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-500/10">
            <FolderOpen size={24} className="text-purple-400" />
          </div>
          <h3 className="mb-2 font-semibold text-white">
            {activeFolder
              ? "Esta pasta está vazia"
              : folders.length > 0 && media.length > 0
                ? "Nenhum arquivo fora das pastas"
                : "Nenhum arquivo ainda"}
          </h3>
          <p className="mx-auto max-w-sm text-sm text-gray-500">
            {activeFolder
              ? "Adicione novos arquivos aqui ou selecione mídias em outra pasta e use Mover."
              : folders.length > 0 && media.length > 0
                ? "Abra uma pasta acima ou adicione novos arquivos diretamente à Biblioteca."
                : "Adicione imagens JPEG e vídeos MP4/MOV. Você também pode criar pastas para organizar as mídias."}
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {filtered.map((item) => {
            const isSelected = selected.includes(item.id)
            return (
              <div
                key={item.id}
                className={`group overflow-hidden rounded-2xl border bg-[#111] transition-colors ${
                  isSelected ? "border-purple-500/50" : "border-white/[0.07] hover:border-white/15"
                }`}
              >
                <div className="relative aspect-square bg-black">
                  {item.type === "video" ? (
                    <video src={item.url} className="h-full w-full object-cover" muted preload="metadata" />
                  ) : (
                    <img src={item.url} alt={item.fileName} className="h-full w-full object-cover" />
                  )}
                  <button
                    onClick={() => toggleSelected(item.id)}
                    className={`absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg border backdrop-blur ${
                      isSelected
                        ? "border-purple-400 bg-purple-500 text-white"
                        : "border-white/20 bg-black/50 text-transparent hover:text-white"
                    }`}
                  >
                    <Check size={15} />
                  </button>
                  {item.type === "video" && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur">
                        <Play size={17} fill="currentColor" />
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-3 right-3 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                    {item.type === "video" && (
                      <button
                        onClick={() => {
                          setCaptionFor(item)
                          setCaptionResult(null)
                        }}
                        className="rounded-lg bg-purple-500/80 p-2 text-white backdrop-blur hover:bg-purple-500"
                        title="Gerar legenda com IA"
                      >
                        <Sparkles size={15} />
                      </button>
                    )}
                    <button
                      onClick={() => copyUrl(item.url)}
                      className="rounded-lg bg-black/70 p-2 text-white backdrop-blur hover:bg-black/90"
                      title="Copiar URL"
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      onClick={() => deleteMedia([item.id])}
                      className="rounded-lg bg-red-500/80 p-2 text-white backdrop-blur hover:bg-red-500"
                      title="Apagar arquivo"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div className="p-3.5">
                  <div className="mb-2 flex items-center gap-2">
                    {item.type === "video" ? (
                      <Film size={13} className="text-purple-400" />
                    ) : (
                      <ImageIcon size={13} className="text-pink-400" />
                    )}
                    <p className="truncate text-sm font-medium text-white">{item.fileName}</p>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-600">
                    <span>{formatBytes(item.bytes)}</span>
                    <span>{new Date(item.createdAt).toLocaleDateString("pt-BR")}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {folderEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111] p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white">
                  {folderEditor.mode === "create" ? "Criar nova pasta" : "Renomear pasta"}
                </h2>
                <p className="mt-1 text-xs text-gray-500">Use um nome fácil de encontrar depois.</p>
              </div>
              <button
                onClick={() => setFolderEditor(null)}
                className="rounded-lg p-2 text-gray-500 hover:bg-white/5 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <input
              autoFocus
              maxLength={80}
              value={folderEditor.name}
              onChange={(event) =>
                setFolderEditor((current) =>
                  current ? { ...current, name: event.target.value } : current
                )
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") saveFolder()
              }}
              placeholder="Ex.: MÍDIAS DO DIA 02"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-purple-500/50"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setFolderEditor(null)}
                className="rounded-lg px-4 py-2.5 text-sm text-gray-400 hover:bg-white/5 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={saveFolder}
                disabled={folderSaving || !folderEditor.name.trim()}
                className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
              >
                {folderSaving && <Loader2 size={14} className="animate-spin" />}
                {folderEditor.mode === "create" ? "Criar pasta" : "Salvar nome"}
              </button>
            </div>
          </div>
        </div>
      )}

      {moveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white">Mover arquivos</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Escolha o destino de {selected.length} arquivo{selected.length !== 1 ? "s" : ""}.
                </p>
              </div>
              <button
                onClick={() => setMoveOpen(false)}
                disabled={moving}
                className="rounded-lg p-2 text-gray-500 hover:bg-white/5 hover:text-white disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              <button
                onClick={() => moveSelected(null)}
                disabled={moving || activeFolderId === null}
                className="flex w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-black/20 p-3 text-left hover:border-purple-500/30 hover:bg-purple-500/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-gray-400">
                  <FolderOpen size={17} />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Biblioteca</p>
                  <p className="text-xs text-gray-600">Sem pasta</p>
                </div>
              </button>

              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => moveSelected(folder.id)}
                  disabled={moving || activeFolderId === folder.id}
                  className="flex w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-black/20 p-3 text-left hover:border-purple-500/30 hover:bg-purple-500/5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                    {moving ? <Folder size={17} /> : <Folder size={17} />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{folder.name}</p>
                    <p className="text-xs text-gray-600">{folder._count.media} arquivo(s)</p>
                  </div>
                </button>
              ))}
            </div>

            {folders.length === 0 && activeFolderId === null && (
              <p className="mt-4 text-center text-xs text-gray-600">Crie uma pasta primeiro para mover os arquivos.</p>
            )}
          </div>
        </div>
      )}

      {captionFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => !captionLoading && setCaptionFor(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#111] p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-purple-400" />
                <h3 className="font-semibold text-white">Gerar legenda com IA</h3>
              </div>
              <button
                onClick={() => setCaptionFor(null)}
                disabled={captionLoading}
                className="shrink-0 text-gray-500 hover:text-white disabled:opacity-40"
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              A IA olha 4 frames do vídeo e escreve a legenda. Mandar só os frames custa uma
              fração do que custaria mandar o vídeo inteiro.
            </p>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs text-gray-400">
                Sobre o perfil e o tom <span className="text-gray-600">(opcional, mas ajuda muito)</span>
              </label>
              <textarea
                value={captionContext}
                onChange={(event) => setCaptionContext(event.target.value)}
                rows={2}
                placeholder="Ex: perfil de cortes de futebol, tom debochado, falo direto com torcedor"
                className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-purple-500 focus:outline-none"
              />
            </div>

            {captionResult && (
              <div className="mt-4 space-y-3">
                <p className="text-[11px] text-gray-500">
                  A IA viu: {captionResult.description}
                </p>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5">
                  <p className="text-[10px] uppercase tracking-wide text-gray-600">Legenda</p>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-white">
                    {captionResult.caption}
                  </p>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5">
                  <p className="text-[10px] uppercase tracking-wide text-gray-600">Hashtags</p>
                  <p className="mt-1.5 text-sm text-purple-300">{captionResult.hashtags}</p>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${captionResult.caption}\n\n${captionResult.hashtags}`
                    )
                    toast.success("Legenda copiada.")
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] py-2.5 text-xs text-gray-300 hover:bg-white/[0.06] hover:text-white"
                >
                  <Copy size={13} />
                  Copiar legenda e hashtags
                </button>
              </div>
            )}

            <button
              onClick={() => generateCaption(captionFor)}
              disabled={captionLoading}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {captionLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {captionLoading ? captionStep : captionResult ? "Gerar outra" : "Gerar legenda"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
