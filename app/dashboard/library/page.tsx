"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Check,
  CheckCircle2,
  Copy,
  Film,
  FolderOpen,
  ImageIcon,
  Layers3,
  Loader2,
  Play,
  Trash2,
  Upload,
} from "lucide-react"

type MediaItem = {
  id: string
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

type CloudinarySignature = {
  cloudName: string
  apiKey: string
  timestamp: number
  folder: string
  signature: string
}

type UploadResponse = {
  secure_url?: string
  public_id?: string
  resource_type?: string
  bytes?: number
  width?: number
  height?: number
  duration?: number
  format?: string
  error?: { message?: string }
}

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
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [filter, setFilter] = useState<"all" | "video" | "image">("all")
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchMedia = async () => {
    setError(null)
    try {
      const response = await fetch("/api/library", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Erro ao carregar a biblioteca")
      setMedia(Array.isArray(data) ? data : [])
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro ao carregar a biblioteca")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMedia()
  }, [])

  const getSignature = async () => {
    const response = await fetch("/api/cloudinary/signature", { method: "POST" })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "Não foi possível preparar o upload")
    return data as CloudinarySignature
  }

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

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return
    setUploading(true)
    setError(null)

    try {
      const signature = await getSignature()

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]
        const type = validateFile(file)
        setUploadProgress(`Enviando ${index + 1} de ${files.length}: ${file.name}`)

        const formData = new FormData()
        formData.append("file", file)
        formData.append("api_key", signature.apiKey)
        formData.append("timestamp", String(signature.timestamp))
        formData.append("folder", signature.folder)
        formData.append("signature", signature.signature)

        const uploadResponse = await fetch(
          `https://api.cloudinary.com/v1_1/${signature.cloudName}/${type}/upload`,
          { method: "POST", body: formData }
        )
        const uploaded = (await uploadResponse.json()) as UploadResponse

        if (!uploadResponse.ok || !uploaded.secure_url || !uploaded.public_id) {
          throw new Error(uploaded.error?.message || `Falha ao enviar ${file.name}`)
        }

        const saveResponse = await fetch("/api/library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: uploaded.secure_url,
            type,
            fileName: file.name,
            publicId: uploaded.public_id,
            resourceType: uploaded.resource_type || type,
            bytes: uploaded.bytes,
            width: uploaded.width,
            height: uploaded.height,
            duration: uploaded.duration,
            format: uploaded.format,
          }),
        })
        const saved = await saveResponse.json()
        if (!saveResponse.ok) throw new Error(saved.error || "Falha ao salvar a mídia")
      }

      await fetchMedia()
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Erro ao enviar arquivos")
    } finally {
      setUploading(false)
      setUploadProgress("")
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const deleteMedia = async (ids: string[]) => {
    if (ids.length === 0) return
    if (!confirm(`Apagar ${ids.length} arquivo(s) da biblioteca e do Cloudinary?`)) return

    setDeleting(true)
    setError(null)
    try {
      const response = await fetch("/api/library", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Não foi possível apagar")
      setSelected((current) => current.filter((id) => !ids.includes(id)))
      await fetchMedia()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Não foi possível apagar")
    } finally {
      setDeleting(false)
    }
  }

  const toggleSelected = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]
    )
  }

  const copyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url)
    setCopied(url)
    setTimeout(() => setCopied(null), 1800)
  }

  const filtered = useMemo(
    () => (filter === "all" ? media : media.filter((item) => item.type === filter)),
    [filter, media]
  )
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((item) => selected.includes(item.id))

  const startAutomation = () => {
    const params = new URLSearchParams({ media: selected.join(",") })
    router.push(`/dashboard/schedule?${params.toString()}`)
  }

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Biblioteca</h1>
          <p className="mt-1 text-sm text-gray-500">
            {media.length} arquivo{media.length !== 1 ? "s" : ""} salvo{media.length !== 1 ? "s" : ""} para reutilizar
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {selected.length > 0 && (
            <>
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

      {uploadProgress && (
        <div className="mb-5 rounded-xl border border-purple-500/20 bg-purple-500/10 px-4 py-3 text-sm text-purple-200">
          {uploadProgress}
        </div>
      )}
      {error && (
        <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
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
                  : Array.from(
                      new Set<string>([
                        ...current,
                        ...filtered.map((item) => item.id),
                      ])
                    )
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
          <h3 className="mb-2 font-semibold text-white">Nenhum arquivo ainda</h3>
          <p className="mx-auto max-w-sm text-sm text-gray-500">
            Adicione imagens JPEG e vídeos MP4/MOV. Depois selecione vários arquivos para criar uma sequência automática.
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
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur">
                        <Play size={17} fill="currentColor" />
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-3 right-3 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => copyUrl(item.url)}
                      className="rounded-lg bg-black/70 p-2 text-white backdrop-blur hover:bg-black/90"
                    >
                      {copied === item.url ? <CheckCircle2 size={15} className="text-green-400" /> : <Copy size={15} />}
                    </button>
                    <button
                      onClick={() => deleteMedia([item.id])}
                      className="rounded-lg bg-red-500/80 p-2 text-white backdrop-blur hover:bg-red-500"
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
    </div>
  )
}
