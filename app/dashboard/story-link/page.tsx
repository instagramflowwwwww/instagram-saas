"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Link2, Loader2, RefreshCw, Send, Trash2, X } from "lucide-react"
import toast from "react-hot-toast"
import { confirmToast } from "@/lib/toast"

type LibraryMedia = { id: string; url: string; type: string; fileName: string }
type StoryRecord = {
  id: string
  storyPostUuid: string
  instagramUsername: string
  mediaUrl: string
  linkUrl: string
  linkText: string
  scheduledAt: string | null
  status: string
  warnings: string | null
  createdAt: string
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Agendado",
  executed: "Publicado",
  failed: "Falhou",
  canceled: "Cancelado",
}

const STATUS_CLASSES: Record<string, string> = {
  scheduled: "border-purple-500/20 bg-purple-500/10 text-purple-300",
  executed: "border-green-500/20 bg-green-500/10 text-green-300",
  failed: "border-red-500/20 bg-red-500/10 text-red-300",
  canceled: "border-gray-500/20 bg-gray-500/10 text-gray-300",
}

const inputClass =
  "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"

function formatDate(value: string | null) {
  if (!value) return "Imediato"
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
}

export default function StoryLinkPage() {
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(false)
  const [baseUrl, setBaseUrl] = useState("")
  const [token, setToken] = useState("")
  const [savingConfig, setSavingConfig] = useState(false)

  const [accounts, setAccounts] = useState<string[]>([])
  const [library, setLibrary] = useState<LibraryMedia[]>([])
  const [stories, setStories] = useState<StoryRecord[]>([])

  const [username, setUsername] = useState("")
  const [mediaUrl, setMediaUrl] = useState("")
  const [mediaType, setMediaType] = useState<"image" | "video">("video")
  const [linkUrl, setLinkUrl] = useState("")
  const [linkText, setLinkText] = useState("Acesse aqui")
  const [design, setDesign] = useState("default")
  const [scheduledAt, setScheduledAt] = useState("")
  const [sending, setSending] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const loadStories = async () => {
    const res = await fetch("/api/storrito/stories", { cache: "no-store" })
    const data = await res.json().catch(() => ({}))
    if (res.ok) setStories(Array.isArray(data.stories) ? data.stories : [])
  }

  const loadAll = async () => {
    try {
      const cfgRes = await fetch("/api/storrito/config", { cache: "no-store" })
      const cfg = await cfgRes.json()
      setConfigured(Boolean(cfg.configured))
      if (cfg.baseUrl) setBaseUrl(cfg.baseUrl)

      if (cfg.configured) {
        const [accRes, libRes] = await Promise.all([
          fetch("/api/storrito/accounts", { cache: "no-store" }),
          fetch("/api/library", { cache: "no-store" }),
        ])
        const acc = await accRes.json().catch(() => ({}))
        if (accRes.ok) {
          const names: string[] = (acc.accounts || []).map((item: { username: string }) => item.username)
          setAccounts(names)
          setUsername((current) => current || names[0] || "")
        } else {
          toast.error(acc.error || "Não foi possível listar as contas do Storrito.")
        }
        const lib = await libRes.json().catch(() => [])
        setLibrary(Array.isArray(lib) ? lib : [])
        await loadStories()
      }
    } catch {
      toast.error("Não foi possível carregar a página.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadAll() }, [])

  const saveConfig = async (event: React.FormEvent) => {
    event.preventDefault()
    setSavingConfig(true)
    try {
      const res = await fetch("/api/storrito/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.")
      setToken("")
      toast.success("Storrito conectado.")
      setLoading(true)
      await loadAll()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.")
    } finally {
      setSavingConfig(false)
    }
  }

  const removeConfig = async () => {
    const ok = await confirmToast("Desconectar o Storrito do InstaFlow?", { confirmLabel: "Desconectar", danger: true })
    if (!ok) return
    await fetch("/api/storrito/config", { method: "DELETE" })
    setConfigured(false)
    setAccounts([])
    setStories([])
    toast.success("Storrito desconectado.")
  }

  const pickFromLibrary = (id: string) => {
    const item = library.find((entry) => entry.id === id)
    if (!item) return
    setMediaUrl(item.url)
    setMediaType(item.type === "image" ? "image" : "video")
  }

  const send = async (event: React.FormEvent) => {
    event.preventDefault()
    setSending(true)
    try {
      const res = await fetch("/api/storrito/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instagramUsername: username,
          mediaUrl,
          mediaType,
          linkUrl,
          linkText,
          design,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Não foi possível enviar o story.")
      toast.success(scheduledAt ? "Story agendado." : "Story enviado pra publicar agora.")
      await loadStories()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o story.")
    } finally {
      setSending(false)
    }
  }

  const refresh = async (story: StoryRecord) => {
    setBusyId(story.id)
    try {
      const res = await fetch(`/api/storrito/stories/${story.storyPostUuid}`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Não foi possível atualizar.")
      await loadStories()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar.")
    } finally {
      setBusyId(null)
    }
  }

  const cancel = async (story: StoryRecord) => {
    const ok = await confirmToast("Cancelar este story agendado?", { confirmLabel: "Cancelar story", danger: true })
    if (!ok) return
    setBusyId(story.id)
    try {
      const res = await fetch(`/api/storrito/stories/${story.storyPostUuid}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Não foi possível cancelar.")
      await loadStories()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível cancelar.")
    } finally {
      setBusyId(null)
    }
  }

  const canSend = useMemo(
    () => Boolean(username && mediaUrl && linkUrl && linkText),
    [username, mediaUrl, linkUrl, linkText]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-purple-400" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Link2 size={20} className="text-purple-400" />
          <h1 className="text-2xl font-bold text-white">Story com link</h1>
        </div>
        <p className="text-gray-500 mt-1">
          Posta story com o adesivo de link usando o Storrito, um serviço de terceiros. A API oficial
          da Meta não permite esse adesivo.
        </p>
      </div>

      <div className="mb-5 flex gap-3 rounded-xl border border-orange-500/20 bg-orange-500/[0.06] p-4">
        <AlertTriangle size={18} className="text-orange-400 shrink-0 mt-0.5" />
        <p className="text-xs text-orange-200/80 leading-relaxed">
          O Storrito posta automatizando o app do Instagram, e não pela API oficial. Isso foge dos
          Termos de Uso da Meta e pode gerar restrição na conta. A conta do Instagram é conectada
          dentro do Storrito, e o InstaFlow nunca vê a senha. Comece com uma conta de teste.
        </p>
      </div>

      <div className="bg-[#111] border border-white/5 rounded-2xl p-6 mb-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-white font-semibold">Conexão com o Storrito</h2>
          {configured && (
            <button onClick={removeConfig} className="inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300">
              <X size={13} /> Desconectar
            </button>
          )}
        </div>
        {configured ? (
          <p className="text-sm text-gray-400">
            Conectado em <span className="font-mono text-gray-300 break-all">{baseUrl}</span>. O token
            fica guardado cifrado e não aparece de novo.
          </p>
        ) : (
          <form onSubmit={saveConfig} className="space-y-3">
            <p className="text-xs text-gray-500">
              No Storrito, abra as credenciais da API, gere um token e copie também a URL base
              (parece com https://CODIGO.storrito.com/api/v1).
            </p>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required placeholder="URL base da API" className={inputClass} />
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} required placeholder="Token da API" className={inputClass} />
            <button type="submit" disabled={savingConfig} className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg">
              {savingConfig && <Loader2 size={14} className="animate-spin" />} Conectar
            </button>
          </form>
        )}
      </div>

      {configured && (
        <>
          <form onSubmit={send} className="bg-[#111] border border-white/5 rounded-2xl p-6 mb-5 space-y-3">
            <h2 className="text-white font-semibold mb-1">Novo story</h2>

            <select value={username} onChange={(e) => setUsername(e.target.value)} required className={inputClass}>
              {accounts.length === 0 && <option value="">Nenhuma conta conectada no Storrito</option>}
              {accounts.map((name) => (
                <option key={name} value={name}>@{name}</option>
              ))}
            </select>

            {library.length > 0 && (
              <select defaultValue="" onChange={(e) => pickFromLibrary(e.target.value)} className={inputClass}>
                <option value="">Escolher da biblioteca (opcional)</option>
                {library.map((item) => (
                  <option key={item.id} value={item.id}>{item.type === "image" ? "Imagem" : "Vídeo"} · {item.fileName}</option>
                ))}
              </select>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
              <input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} required placeholder="URL pública da mídia (9:16)" className={inputClass} />
              <select value={mediaType} onChange={(e) => setMediaType(e.target.value as "image" | "video")} className={inputClass}>
                <option value="video">Vídeo</option>
                <option value="image">Imagem</option>
              </select>
            </div>

            <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} required placeholder="Link do adesivo (https://...)" className={inputClass} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input value={linkText} onChange={(e) => setLinkText(e.target.value)} maxLength={30} required placeholder="Texto do adesivo" className={inputClass} />
              <select value={design} onChange={(e) => setDesign(e.target.value)} className={inputClass}>
                <option value="default">Estilo padrão</option>
                <option value="gray">Cinza</option>
                <option value="black">Preto</option>
                <option value="rainbow">Arco-íris</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Quando publicar (deixe vazio para publicar agora)</label>
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className={`${inputClass} [color-scheme:dark]`} />
            </div>

            <button type="submit" disabled={sending || !canSend} className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg">
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {scheduledAt ? "Agendar story" : "Publicar story agora"}
            </button>
          </form>

          <div className="bg-[#111] border border-white/5 rounded-2xl p-6">
            <h2 className="text-white font-semibold mb-4">Últimos stories</h2>
            {stories.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Nenhum story enviado ainda.</p>
            ) : (
              <div className="space-y-2">
                {stories.map((story) => (
                  <div key={story.id} className="flex items-center gap-3 bg-white/[0.025] border border-white/5 rounded-xl p-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">@{story.instagramUsername} · {story.linkText}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{formatDate(story.scheduledAt)} · {story.linkUrl}</p>
                      {story.warnings && <p className="text-[11px] text-orange-300/80 mt-0.5 truncate">Avisos: {story.warnings}</p>}
                    </div>
                    <span className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] border ${STATUS_CLASSES[story.status] || STATUS_CLASSES.scheduled}`}>
                      {STATUS_LABELS[story.status] || story.status}
                    </span>
                    <button onClick={() => refresh(story)} disabled={busyId === story.id} title="Atualizar status" className="p-2 text-gray-500 hover:text-purple-400 hover:bg-purple-500/10 rounded-lg disabled:opacity-50">
                      {busyId === story.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                    {story.status === "scheduled" && (
                      <button onClick={() => cancel(story)} disabled={busyId === story.id} title="Cancelar" className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg disabled:opacity-50">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
