"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import {
  CalendarClock,
  CheckCircle,
  Film,
  Image,
  Instagram,
  Loader2,
  Layers3,
  Send,
  Upload,
  X,
  XCircle,
  Shuffle,
} from "lucide-react"
import toast from "react-hot-toast"
import { toastWarning } from "@/lib/toast"
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

type LibraryMedia = {
  id: string
  url: string
  type: string
  fileName: string
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
  const [results, setResults] = useState<PublishResult[]>([])
  const [randomMode, setRandomMode] = useState(false)
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now")
  const [scheduledAt, setScheduledAt] = useState("")
  const [library, setLibrary] = useState<LibraryMedia[]>([])
  const [loadingLibrary, setLoadingLibrary] = useState(false)
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
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Erro ao carregar as contas", {
          id: "publish-accounts-load-error",
        })
      )
  }, [])

  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview)
    }
  }, [coverPreview])

  useEffect(() => {
    if (randomMode && library.length === 0) {
      setLoadingLibrary(true)
      fetch("/api/library")
        .then((r) => r.json())
        .then((data) => {
          const videos = (Array.isArray(data) ? data : []).filter(
            (m: LibraryMedia) => m.type === "video"
          )
          setLibrary(videos)
          if (videos.length === 0) {
            toast.error("Nenhum vídeo encontrado na biblioteca. Adicione vídeos primeiro.")
            setRandomMode(false)
          }
        })
        .catch(() => {
          toast.error("Erro ao carregar a biblioteca")
          setRandomMode(false)
        })
        .finally(() => setLoadingLibrary(false))
    }
  }, [randomMode])

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

  const publishRandom = async () => {
    if (selectedAccounts.length === 0) {
      toast.error("Selecione pelo menos uma conta")
      return
    }
    if (library.length === 0) {
      toast.error("Nenhum vídeo na biblioteca")
      return
    }

    setPublishing(true)
    setResults([])
    const toastId = toast.loading("Publicando aleatório...")

    try {
      const allResults: PublishResult[] = []

      for (const accountId of selectedAccounts) {
        const randomVideo = library[Math.floor(Math.random() * library.length)]
        setPublishStage(`Publicando @${accounts.find(a => a.id === accountId)?.username}...`)

        const response = await fetch("/api/posts/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoUrl: randomVideo.url,
            imageUrl: "",
            coverUrl: "",
            caption,
            hashtags,
            accountIds: [accountId],
          }),
        })
        const data = await response.json()

        if (!response.ok) {
          allResults.push({
            accountId,
            username: accounts.find(a => a.id === accountId)?.username || accountId,
            status: "error",
            error: data.error || "Erro ao publicar",
          })
        } else if (data.results?.length > 0) {
          allResults.push(...data.results)
        }
      }

      setResults(allResults)
      const successCount = allResults.filter((r) => r.status === "success").length
      const errorCount = allResults.length - successCount

      if (errorCount === 0) {
        toast.success(`Publicado com sucesso em ${successCount} conta(s).`, { id: toastId })
      } else if (successCount > 0) {
        toast.dismiss(toastId)
        toastWarning(`Publicado em ${successCount} conta(s), com falha em ${errorCount}.`)
      } else {
        toast.error("A publicação falhou em todas as contas.", { id: toastId })
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível publicar",
        { id: toastId }
      )
    } finally {
      setPublishing(false)
      setPublishStage("")
    }
  }

  const publish = async () => {
    if (randomMode) return publishRandom()

    if (!videoFile && !imageFile) {
      toast.error("Adicione uma imagem ou um vídeo")
      return
    }
    if (selectedAccounts.length === 0) {
      toast.error("Selecione pelo menos uma conta")
      return
    }
    if (imageFile && imageFile.type !== "image/jpeg") {
      toast.error("A API oficial aceita somente imagem JPEG no feed")
      return
    }
    if (coverFile && coverFile.type !== "image/jpeg") {
      toast.error("A capa do Reel deve ser uma imagem JPEG")
      return
    }
    if (imageFile && imageFile.size > IMAGE_LIMIT) {
      toast.error("A imagem JPEG pode ter no máximo 8 MB")
      return
    }
    if (coverFile && coverFile.size > IMAGE_LIMIT) {
      toast.error("A capa JPEG pode ter no máximo 8 MB")
      return
    }
    if (videoFile && videoFile.size > VIDEO_LIMIT) {
      toast.error("O vídeo pode ter no máximo 200 MB")
      return
    }
    if (scheduleMode === "later" && !scheduledAt) {
      toast.error("Escolha a data e a hora do agendamento.")
      return
    }
    if (scheduleMode === "later" && new Date(scheduledAt).getTime() < Date.now()) {
      toast.error("A data de agendamento precisa estar no futuro.")
      return
    }

    setPublishing(true)
    setResults([])
    const toastId = toast.loading("Enviando mídia...")

    try {
      setPublishStage("Enviando mídia...")
      const [videoUrl, imageUrl, coverUrl] = await Promise.all([
        videoFile ? uploadMedia(videoFile) : Promise.resolve(""),
        imageFile ? uploadMedia(imageFile) : Promise.resolve(""),
        coverFile ? uploadMedia(coverFile) : Promise.resolve(""),
      ])

      const isScheduled = scheduleMode === "later"
      setPublishStage(isScheduled ? "Agendando..." : "Publicando no Instagram...")
      toast.loading(isScheduled ? "Agendando..." : "Publicando no Instagram...", { id: toastId })
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
          ...(isScheduled ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível publicar")
      }

      if (data.queued) {
        setResults([])
        toast.success(
          isScheduled
            ? `Agendado para ${new Date(scheduledAt).toLocaleString("pt-BR")} em ${Number(data.accountCount || selectedAccounts.length)} conta(s).`
            : `Publicação enviada para a fila de ${Number(data.accountCount || selectedAccounts.length)} conta(s). O processamento continuará automaticamente.`,
          { id: toastId }
        )
        return
      }

      const publishResults = Array.isArray(data.results) ? (data.results as PublishResult[]) : []
      setResults(publishResults)

      const successCount = publishResults.filter((result) => result.status === "success").length
      const errorCount = publishResults.length - successCount

      if (publishResults.length > 0 && errorCount === 0) {
        toast.success(`Publicado com sucesso em ${successCount} conta(s).`, { id: toastId })
      } else if (successCount > 0) {
        toast.dismiss(toastId)
        toastWarning(`Publicado em ${successCount} conta(s), com falha em ${errorCount}.`)
      } else {
        toast.error("A publicação falhou em todas as contas selecionadas.", { id: toastId })
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível publicar",
        { id: toastId }
      )
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

      {/* Toggle modo aleatório */}
      <div className="mb-6">
        <button
          onClick={() => setRandomMode(!randomMode)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            randomMode
              ? "bg-green-500/20 border border-green-500/30 text-green-300"
              : "bg-white/5 border border-white/10 text-gray-400 hover:text-white"
          }`}
        >
          {loadingLibrary ? <Loader2 size={15} className="animate-spin" /> : <Shuffle size={15} />}
          {randomMode ? "Modo aleatório ativado — cada conta recebe um vídeo diferente da biblioteca" : "Ativar modo aleatório"}
        </button>
      </div>

      <div className="grid grid-cols-5 gap-6">
        <div className="col-span-3 space-y-4">
          {!randomMode && (
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
            </div>
          )}

          {randomMode && (
            <div className="bg-[#111] border border-green-500/20 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <Shuffle size={16} className="text-green-400" />
                <h2 className="font-semibold text-white text-sm">Modo aleatório</h2>
              </div>
              <p className="text-gray-500 text-sm">
                {library.length > 0
                  ? `${library.length} vídeo(s) disponíveis na biblioteca. Cada conta selecionada receberá um vídeo diferente sorteado aleatoriamente.`
                  : "Carregando biblioteca..."}
              </p>
            </div>
          )}

          <div className="bg-[#111] border border-white/5 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-white text-sm">Legenda e hashtags</h2>
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

          {!randomMode && (
            <div className="bg-[#111] border border-white/5 rounded-xl p-6 space-y-3">
              <h2 className="font-semibold text-white text-sm">Quando publicar</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setScheduleMode("now")}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                    scheduleMode === "now"
                      ? "border-purple-500/40 bg-purple-500/15 text-purple-300"
                      : "border-white/10 bg-white/5 text-gray-400 hover:text-white"
                  }`}
                >
                  <Send size={14} />
                  Agora
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleMode("later")}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                    scheduleMode === "later"
                      ? "border-purple-500/40 bg-purple-500/15 text-purple-300"
                      : "border-white/10 bg-white/5 text-gray-400 hover:text-white"
                  }`}
                >
                  <CalendarClock size={14} />
                  Agendar
                </button>
              </div>

              {scheduleMode === "later" && (
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Data e hora</label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                    onChange={(event) => setScheduledAt(event.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 [color-scheme:dark]"
                  />
                  <p className="mt-1.5 text-[11px] text-gray-600">
                    O post entra na fila e sai sozinho nesse horário — não precisa deixar a tela aberta.
                  </p>
                </div>
              )}
            </div>
          )}

          <button
            onClick={publish}
            disabled={publishing || (randomMode && library.length === 0) || (scheduleMode === "later" && !scheduledAt)}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-opacity"
          >
            {publishing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : randomMode ? (
              <Shuffle size={16} />
            ) : scheduleMode === "later" ? (
              <CalendarClock size={16} />
            ) : (
              <Upload size={16} />
            )}
            {publishing
              ? publishStage
              : randomMode
                ? `Publicar aleatório em ${selectedAccounts.length} conta(s)`
                : scheduleMode === "later"
                  ? `Agendar para ${selectedAccounts.length} conta(s)`
                  : `Publicar em ${selectedAccounts.length} conta(s)`}
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
