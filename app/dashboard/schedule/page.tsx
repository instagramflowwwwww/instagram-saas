"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Check,
  Clipboard,
  ExternalLink,
  Eye,
  EyeOff,
  Instagram,
  KeyRound,
  Loader2,
  Pencil,
  PlugZap,
  Plus,
  Save,
  ShieldCheck,
  Tag,
  Trash2,
  UserPlus,
  X,
} from "lucide-react"
import toast from "react-hot-toast"
import { confirmToast } from "@/lib/toast"

type MetaApp = {
  id: string
  appId: string
  name: string | null
  secretConfigured: boolean
  lastValidatedAt: string | null
  createdAt: string | null
  updatedAt: string | null
  accountsCount: number
}

type MetaAppsData = {
  configured: boolean
  apps: MetaApp[]
  appsCount: number
  accountsCount: number
  redirectUri: string
}

type InstagramAccount = {
  id: string
  username: string
  name: string | null
  accountType: string | null
  profilePicture: string | null
  followerCount: number | null
  isActive: boolean
  requiresReconnect: boolean
  tokenExpiresAt: string | null
  autoDeleteAt: string | null
  appConfigId: string | null
  appId: string | null
}

type OAuthResult = {
  eventId: string
  success: string | null
  errorCode: string | null
  callbackMessage: string | null
  connectedUsername: string | null
  expected: string | null
  connected: string | null
  appConfigId?: string
}

const OAUTH_CHANNEL_NAME = "instagram-meta-oauth"
const OAUTH_STORAGE_KEY = "instagram-meta-oauth-result"

const errorMessages: Record<string, string> = {
  app_not_configured: "Salve o Instagram App ID e o App Secret antes de conectar uma conta.",
  app_required: "Escolha qual App Meta será usado para conectar esta conta.",
  invalid_username: "Informe um usuário do Instagram válido.",
  oauth_cancelled: "A autorização foi cancelada no Instagram.",
  missing_oauth_data: "A Meta não retornou os dados necessários para concluir a conexão.",
  invalid_state: "A tentativa de conexão é inválida. Inicie novamente.",
  expired_state: "A tentativa de conexão expirou. Inicie novamente.",
  callback_failed: "A Meta não concluiu a conexão da conta.",
  wrong_account: "Você autorizou uma conta diferente da conta informada.",
}

function formatDate(value: string | null) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

function maskAppId(value: string) {
  if (!value) return "—"
  if (value.length <= 8) return value
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

function getAppLabel(app: MetaApp, index: number) {
  return app.name || `App Meta ${index + 1}`
}

export default function MetaAppPage() {
  const [metaData, setMetaData] = useState<MetaAppsData | null>(null)
  const [apps, setApps] = useState<MetaApp[]>([])
  const [accounts, setAccounts] = useState<InstagramAccount[]>([])
  const [appId, setAppId] = useState("")
  const [appSecret, setAppSecret] = useState("")
  const [appName, setAppName] = useState("")
  const [editingAppId, setEditingAppId] = useState<string | null>(null)
  const [selectedAppId, setSelectedAppId] = useState("")
  const [username, setUsername] = useState("")
  const [showSecret, setShowSecret] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const handledOAuthEventRef = useRef<string | null>(null)

  const configured = apps.length > 0
  const selectedApp = useMemo(
    () => apps.find((app) => app.id === selectedAppId) || null,
    [apps, selectedAppId]
  )
  const selectedAccounts = useMemo(
    () => accounts.filter((account) => account.appConfigId === selectedAppId),
    [accounts, selectedAppId]
  )
  const normalizedUsername = username.trim().replace(/^@/, "").toLowerCase()
  const canConnect = Boolean(selectedAppId) && /^[a-z0-9._]{1,30}$/.test(normalizedUsername)

  const loadData = async (preferredAppId?: string) => {
    try {
      const [appResponse, accountsResponse] = await Promise.all([
        fetch("/api/instagram/meta-app", { cache: "no-store" }),
        fetch("/api/instagram/accounts", { cache: "no-store" }),
      ])

      const appData = await appResponse.json()
      const accountsData = await accountsResponse.json()

      if (!appResponse.ok) throw new Error(appData.error || "Não foi possível carregar os Apps Meta.")
      if (!accountsResponse.ok) throw new Error(accountsData.error || "Não foi possível carregar as contas.")

      const loadedApps: MetaApp[] = Array.isArray(appData.apps) ? appData.apps : []

      setMetaData(appData)
      setApps(loadedApps)
      setAccounts(Array.isArray(accountsData) ? accountsData : [])
      setSelectedAppId((current) => {
        const requested = preferredAppId || current
        if (requested && loadedApps.some((app) => app.id === requested)) return requested
        return loadedApps[0]?.id || ""
      })
    } catch (loadError) {
      toast.error(
        loadError instanceof Error ? loadError.message : "Não foi possível carregar a configuração.",
        { id: "meta-app-load-error" }
      )
    } finally {
      setLoading(false)
    }
  }

  const showOAuthResultToast = (result: OAuthResult) => {
    if (result.success === "connected") {
      toast.success(
        result.connectedUsername
          ? `@${result.connectedUsername} conectada com sucesso pelo App Meta.`
          : "Conta conectada com sucesso pelo App Meta."
      )
    }
    if (result.errorCode) {
      if (result.errorCode === "wrong_account") {
        toast.error(`Você informou @${result.expected || "outra_conta"}, mas autorizou @${result.connected || "outra_conta"}. Tente novamente com a conta correta.`)
      } else {
        toast.error(result.callbackMessage || errorMessages[result.errorCode] || "Erro ao conectar a conta.")
      }
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const success = params.get("success")
    const errorCode = params.get("error")
    const callbackMessage = params.get("message")
    const connectedUsername = params.get("username")
    const expected = params.get("expected")
    const connected = params.get("connected")
    const callbackAppConfigId = params.get("appConfigId") || undefined
    const isOAuthPopup = params.get("oauthPopup") === "1"
    const hasOAuthResult = Boolean(success || errorCode)
    const callbackResult: OAuthResult | null = hasOAuthResult
      ? { eventId: `${Date.now()}-${Math.random().toString(36).slice(2)}`, success, errorCode, callbackMessage, connectedUsername, expected, connected, appConfigId: callbackAppConfigId }
      : null

    const processOAuthResult = (result: OAuthResult) => {
      if (!result?.eventId || handledOAuthEventRef.current === result.eventId) return
      handledOAuthEventRef.current = result.eventId
      if (result.success === "connected") setUsername("")
      showOAuthResultToast(result)
      void loadData(result.appConfigId)
    }

    let channel: BroadcastChannel | null = null
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel(OAUTH_CHANNEL_NAME)
      channel.addEventListener("message", (event: MessageEvent<OAuthResult>) => {
        processOAuthResult(event.data)
      })
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== OAUTH_STORAGE_KEY || !event.newValue) return
      try { processOAuthResult(JSON.parse(event.newValue) as OAuthResult) } catch { }
    }

    const handleFocus = () => { void loadData() }

    window.addEventListener("storage", handleStorage)
    window.addEventListener("focus", handleFocus)

    if (isOAuthPopup && callbackResult) {
      try { channel?.postMessage(callbackResult) } catch { }
      try {
        localStorage.setItem(OAUTH_STORAGE_KEY, JSON.stringify(callbackResult))
        localStorage.removeItem(OAUTH_STORAGE_KEY)
      } catch { }
      window.history.replaceState({}, "", "/dashboard/meta-app")
      window.close()
      const closeFallbackTimer = window.setTimeout(() => {
        if (!window.closed) processOAuthResult(callbackResult)
      }, 300)
      return () => {
        window.clearTimeout(closeFallbackTimer)
        channel?.close()
        window.removeEventListener("storage", handleStorage)
        window.removeEventListener("focus", handleFocus)
      }
    }

    void loadData(callbackAppConfigId)

    if (callbackResult) {
      handledOAuthEventRef.current = callbackResult.eventId
      if (callbackResult.success === "connected") setUsername("")
      showOAuthResultToast(callbackResult)
    }

    if (hasOAuthResult) window.history.replaceState({}, "", "/dashboard/meta-app")

    return () => {
      channel?.close()
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener("focus", handleFocus)
    }
  }, [])

  const resetForm = () => {
    setEditingAppId(null)
    setAppId("")
    setAppSecret("")
    setAppName("")
    setShowSecret(false)
  }

  const saveApp = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      const response = await fetch("/api/instagram/meta-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configId: editingAppId, appId, appSecret, name: appName }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar o App Meta.")
      const savedConfigId = String(data.configId || "")
      resetForm()
      toast.success(editingAppId ? "App Meta atualizado com sucesso." : "App Meta adicionado com sucesso.")
      await loadData(savedConfigId || undefined)
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Não foi possível salvar o App Meta.")
    } finally {
      setSaving(false)
    }
  }

  const editApp = (app: MetaApp) => {
    setEditingAppId(app.id)
    setAppId(app.appId)
    setAppSecret("")
    setAppName(app.name || "")
    setShowSecret(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const deleteApp = async (app: MetaApp) => {
    const confirmed = await confirmToast(`Excluir o App Meta ${app.name || maskAppId(app.appId)}?`, { confirmLabel: "Excluir", danger: true })
    if (!confirmed) return
    setDeletingId(app.id)
    try {
      const response = await fetch("/api/instagram/meta-app", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configId: app.id }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Não foi possível excluir o App Meta.")
      if (editingAppId === app.id) resetForm()
      toast.success("App Meta removido.")
      await loadData()
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Não foi possível excluir o App Meta.")
    } finally {
      setDeletingId(null)
    }
  }

  const copyRedirectUri = async () => {
    if (!metaData?.redirectUri) return
    try {
      await navigator.clipboard.writeText(metaData.redirectUri)
      toast.success("Redirect URI copiada.")
    } catch {
      toast.error("Não foi possível copiar a Redirect URI.")
    }
  }

  const connectAccount = () => {
    if (!configured) { toast.error("Adicione um App Meta antes de conectar uma conta."); return }
    if (!selectedAppId) { toast.error("Escolha qual App Meta será usado nesta conta."); return }
    if (!canConnect) { toast.error("Informe um usuário do Instagram válido."); return }

    const params = new URLSearchParams({ username: normalizedUsername, appConfigId: selectedAppId })
    const sameTabUrl = `/api/instagram/oauth/start?${params.toString()}`
    const authTab = window.open("about:blank", "_blank")

    if (!authTab) {
      toast.error("O navegador bloqueou a nova aba. A autorização será aberta nesta aba.")
      window.location.href = sameTabUrl
      return
    }

    try { authTab.opener = null } catch { }

    params.set("popup", "1")
    const popupUrl = new URL(`/api/instagram/oauth/start?${params.toString()}`, window.location.origin).toString()

    try { authTab.location.href = popupUrl } catch { authTab.close(); window.location.href = sameTabUrl }
  }

  const removeAccount = async (id: string) => {
    const confirmed = await confirmToast("Remover esta conta conectada?", { confirmLabel: "Remover", danger: true })
    if (!confirmed) return
    try {
      const response = await fetch("/api/instagram/accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Não foi possível remover a conta.")
      toast.success("Conta removida.")
      await loadData(selectedAppId)
    } catch (removeError) {
      toast.error(removeError instanceof Error ? removeError.message : "Não foi possível remover a conta.")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-purple-400" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Apps Meta</h1>
        <p className="text-gray-500 mt-1">Cadastre vários Apps Meta e escolha qual deles será usado em cada conexão do Instagram.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="bg-[#111] border border-white/5 rounded-2xl p-5">
          <p className="text-xs text-gray-500">Apps configurados</p>
          <p className="text-2xl text-white font-bold mt-1">{apps.length}</p>
        </div>
        <div className="bg-[#111] border border-white/5 rounded-2xl p-5">
          <p className="text-xs text-gray-500">Contas conectadas</p>
          <p className="text-2xl text-white font-bold mt-1">{metaData?.accountsCount || 0}</p>
        </div>
        <div className="bg-[#111] border border-white/5 rounded-2xl p-5">
          <p className="text-xs text-gray-500">App selecionado</p>
          <p className="text-lg text-white font-semibold mt-1">
            {selectedApp ? (selectedApp.name || maskAppId(selectedApp.appId)) : "—"}
          </p>
        </div>
      </div>

      <div className="space-y-5">
        <section className="bg-[#111] border border-white/5 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-white font-semibold">Redirect URI compartilhada</h2>
              <p className="text-xs text-gray-500 mt-1">Cadastre esta mesma URL em todos os Apps Meta adicionados aqui.</p>
            </div>
            <button onClick={copyRedirectUri} className="inline-flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300">
              <Clipboard size={13} /> Copiar
            </button>
          </div>
          <div className="bg-white/[0.025] border border-white/5 rounded-xl p-4">
            <p className="text-xs sm:text-sm text-gray-300 break-all font-mono">{metaData?.redirectUri || "—"}</p>
            <p className="text-[11px] text-gray-600 mt-2">Business login settings → OAuth redirect URIs.</p>
          </div>
        </section>

        <section className="bg-[#111] border border-white/5 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-white font-semibold">{editingAppId ? "Editar App Meta" : "Adicionar App Meta"}</h2>
              <p className="text-xs text-gray-500 mt-1">Use o Instagram App ID e o Instagram App Secret do produto Instagram.</p>
            </div>
            <ShieldCheck size={20} className="text-purple-400" />
          </div>

          <form onSubmit={saveApp} className="space-y-4">
            {/* Nome do app */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Nome do app <span className="text-gray-600">(opcional)</span></label>
              <div className="relative">
                <Tag
