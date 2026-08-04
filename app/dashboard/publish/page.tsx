"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import {
  CheckCircle,
  Film,
  Image,
  Instagram,
  Loader2,
  Layers3,
  Upload,
  X,
  XCircle,
} from "lucide-react"
import { uploadFileToR2 } from "@/lib/r2-upload"

type InstagramAccount = {
  id: string
  username: string
  profilePicture: string | null
  connectionType: string
  isActive: boolean
  requiresReconnect: boolean
}

type PublishResult = {
  accountId: string
  username: string
  status: "success" | "error"
  error?: string
}

const IMAGE_LIMIT = 8 * 1024 * 1024
const VIDEO_LIMIT = 200 * 1024 * 1024

export default function PublishPage() {
  const [accounts, setAccounts] = useState<InstagramAccount[]>([])
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([])
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [caption, setCaption] = useState("")
  const [hashtags, setHashtags] = useState("")
  const [publishing, setPublishing] = useState(false)
  const [publishStage, setPublishStage] = useState("")
  const [publishError, setPublishError] = useState<string | null>(null)
  const [results, setResults] = useState<PublishResult[]>([])
  const videoRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/instagram/accounts", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Erro ao carregar as contas")
        return data
      })
      .then((data) => {
        const accountList = (Array.isArray(data) ? data : []).filter(
          (account: InstagramAccount) =>
            account.connectionType === "official" &&
            account.isActive &&
            !account.requiresReconnect
        )
        setAccounts(accountList)
        setSelectedAccounts(accountList.map((account: InstagramAccount) => account.id))
      })
      .catch((error) => setPublishError(error.message))
  }, [])

  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview)
    }
  }, [coverPreview])

  const toggleAccount = (id: string) => {
    setSelectedAccounts((current) =>
      current.includes(id)
        ? current.filter((accountId) => accountId !== id)
        : [...current, id]
    )
  }

  const selectAll = () => {
    setSelectedAccounts(
      selectedAccounts.length === accounts.length
        ? []
        : accounts.map((account) => account.id)
    )
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleVideoChange = (file: File | null) => {
    setVideoFile(file)
    if (file) setImageFile(null)
  }

  const handleImageChange = (file: File | null) => {
    setImageFile(file)
    if (file) {
      setVideoFile(null)
      handleCoverChange(null)
    }
  }

  const handleCoverChange = (file: File | null) => {
    if (coverPreview) URL.revokeObjectURL(coverPreview)
    setCoverFile(file)
    setCoverPreview(file ? URL.createObjectURL(file) : null)
  }

  const uploadMedia = async (file: File) => {
    const uploaded = await uploadFileToR2(file)
    return uploaded.publicUrl
  }

  const publish = async () => {
    if (!videoFile && !imageFile) {
      setPublishError("Adicione uma imagem ou um vídeo")
      return
    }
    if (selectedAccounts.length === 0) {
      setPublishError("Selecione pelo menos uma conta")
      return
    }
    if (imageFile && imageFile.type !== "image/jpeg") {
      setPublishError("A API oficial aceita somente imagem JPEG no feed")
      return
    }
    if (coverFile && coverFile.type !== "image/jpeg") {
      setPublishError("A capa do Reel deve ser uma imagem JPEG")
      return
    }
    if (imageFile && imageFile.size > IMAGE_LIMIT) {
      setPublishError("A imagem JPEG pode ter no máximo 8 MB")
      return
    }
    if (coverFile && coverFile.size > IMAGE_LIMIT) {
      setPublishError("A capa JPEG pode ter no máximo 8 MB")
      return
    }
    if (videoFile && videoFile.size > VIDEO_LIMIT) {
      setPublishError("O vídeo pode ter no máximo 200 MB")
      return
    }

    setPublishing(true)
    setPublishError(null)
    setResults([])

    try {
      setPublishStage("Enviando mídia...")
      const [videoUrl, imageUrl, coverUrl] = await Promise.all([
        videoFile
          ? uploadMedia(videoFile)
          : Promise.resolve(""),
        imageFile
          ? uploadMedia(imageFile)
          : Promise.resolve(""),
        coverFile
          ? uploadMedia(coverFile)
          : Promise.resolve(""),
      ])

      setPublishStage("Publicando no Instagram...")
      const response = await fetch("/api/posts/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl,
          imageUrl,
          coverUrl,
          caption,
          hashtags,
          accountIds: selectedAccounts,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível publicar")
      }

      setResults(data.results || [])
    } catch (error: any) {
      setPublishError(error.message || "Não foi possível publicar")
    } finally {
      setPublishing(false)
      setPublishStage("")
    }
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Publicar conteúdo</h1>
          <p className="text-gray-500 mt-1">Publique em múltiplas contas ao mesmo tempo</p>
        </div>
        <Link
          href="/dashboard/schedule"
          className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2.5 text-sm font-medium text-purple-300 hover:bg-purple-500/15"
        >
          <Layers3 size={15} /> Automatizar várias mídias
        </Link>
      </div>

      {publishError && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <XCircle size={16} className="text-red-400" />
          <p className="text-red-400 text-sm font-medium">{publishError}</p>
        </div>
      )}

      <div className="grid grid-cols-5 gap-6">
        <div className="col-span-3 space-y-4">
          <div className="bg-[#111] border border-white/5 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-white text-sm">Conteúdo</h2>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Vídeo (Reel)</label>
              <input
                ref={videoRef}
                type="file"
                accept="video/mp4,video/quicktime"
                className="hidden"
                onChange={(event) => handleVideoChange(event.target.files?.[0] || null)}
              />
              {videoFile ? (
                <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5">
                  <Film size={15} className="text-purple-400" />
                  <span className="text-sm text-white flex-1 truncate">{videoFile.name}</span>
                  <span className="text-xs text-gray-500">{formatSize(videoFile.size)}</span>
                  <button onClick={() => handleVideoChange(null)}>
                    <X size={14} className="text-gray-500 hover:text-white" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => videoRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 bg-white/5 border border-dashed border-white/10 rounded-lg px-3 py-4 text-sm text-gray-500 hover:text-white hover:border-purple-500/50 transition-colors"
                >
                  <Film size={15} />
                  Clique para selecionar vídeo
                </button>
              )}
            </div>

            {videoFile && (
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">
                  Capa do Reel <span className="text-gray-600">(opcional)</span>
                </label>
                <input
                  ref={coverRef}
                  type="file"
                  accept="image/jpeg"
                  className="hidden"
                  onChange={(event) => handleCoverChange(event.target.files?.[0] || null)}
                />
                {coverFile && coverPreview ? (
                  <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5">
                    <img src={coverPreview} alt="capa" className="w-10 h-10 rounded object-cover" />
                    <span className="text-sm text-white flex-1 truncate">{coverFile.name}</span>
                    <span className="text-xs text-gray-500">{formatSize(coverFile.size)}</span>
                    <button onClick={() => handleCoverChange(null)}>
                      <X size={14} className="text-gray-500 hover:text-white" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => coverRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 bg-white/5 border border-dashed border-yellow-500/20 rounded-lg px-3 py-4 text-sm text-gray-500 hover:text-white hover:border-yellow-500/50 transition-colors"
                  >
                    <Image size={15} />
                    Clique para adicionar a capa
                  </button>
                )}
              </div>
            )}

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Imagem</label>
              <input
                ref={imageRef}
                type="file"
                accept="image/jpeg"
                className="hidden"
                onChange={(event) => handleImageChange(event.target.files?.[0] || null)}
              />
              {imageFile ? (
                <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5">
                  <Image size={15} className="text-pink-400" />
                  <span className="text-sm text-white flex-1 truncate">{imageFile.name}</span>
                  <span className="text-xs text-gray-500">{formatSize(imageFile.size)}</span>
                  <button onClick={() => handleImageChange(null)}>
                    <X size={14} className="text-gray-500 hover:text-white" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => imageRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 bg-white/5 border border-dashed border-white/10 rounded-lg px-3 py-4 text-sm text-gray-500 hover:text-white hover:border-pink-500/50 transition-colors"
                >
                  <Image size={15} />
                  Clique para selecionar imagem
                </button>
              )}
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Legenda</label>
              <textarea
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="Escreva a legenda do post..."
                rows={4}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 resize-none"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Hashtags</label>
              <input
                value={hashtags}
                onChange={(event) => setHashtags(event.target.value)}
                placeholder="#hashtag1 #hashtag2"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <button
            onClick={publish}
            disabled={publishing}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-opacity"
          >
            {publishing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {publishing ? publishStage : `Publicar em ${selectedAccounts.length} conta(s)`}
          </button>

          {results.length > 0 && (
            <div className="bg-[#111] border border-white/5 rounded-xl p-5 space-y-3">
              <h3 className="font-semibold text-white text-sm">Resultado</h3>
              {results.map((result) => (
                <div key={result.accountId} className="flex items-center gap-3">
                  {result.status === "success" ? (
                    <CheckCircle size={15} className="text-green-400" />
                  ) : (
                    <XCircle size={15} className="text-red-400" />
                  )}
                  <span className="text-sm text-gray-300">@{result.username}</span>
                  <span className={`text-xs ml-auto ${result.status === "success" ? "text-green-400" : "text-red-400"}`}>
                    {result.status === "success" ? "Publicado" : result.error || "Erro"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="col-span-2">
          <div className="bg-[#111] border border-white/5 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-white text-sm">Contas</h2>
              <button onClick={selectAll} className="text-xs text-purple-400 hover:text-purple-300">
                {selectedAccounts.length === accounts.length ? "Limpar" : "Todas"}
              </button>
            </div>

            {accounts.length === 0 ? (
              <p className="text-gray-500 text-xs text-center py-6">Nenhuma conta oficial conectada</p>
            ) : (
              <div className="space-y-2">
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    onClick={() => toggleAccount(account.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      selectedAccounts.includes(account.id)
                        ? "bg-purple-500/10 border border-purple-500/30"
                        : "bg-white/3 border border-white/5 hover:bg-white/5"
                    }`}
                  >
                    {account.profilePicture ? (
                      <img src={account.profilePicture} alt="" className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                        <Instagram size={13} className="text-white" />
                      </div>
                    )}
                    <span className="text-sm text-white">@{account.username}</span>
                    {selectedAccounts.includes(account.id) && (
                      <CheckCircle size={14} className="text-purple-400 ml-auto" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
