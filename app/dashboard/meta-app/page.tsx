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
  Trash2,
  UserPlus,
  X,
} from "lucide-react"
import toast from "react-hot-toast"
import { confirmToast } from "@/lib/toast"

type MetaApp = {
  id: string
  appId: string
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
  app_not_configured:
    "Salve o Instagram App ID e o App Secret antes de conectar uma conta.",
  app_required: "Escolha qual App Meta será usado para conectar esta conta.",
  invalid_username: "Informe um usuário do Instagram válido.",
  oauth_cancelled: "A autorização foi cancelada no Instagram.",
  missing_oauth_data:
    "A Meta não retornou os dados necessários para concluir a conexão.",
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

export default function MetaAppPage() {
  const [metaData, setMetaData] = useState<MetaAppsData | null>(null)
  const [apps, setApps] = useState<MetaApp[]>([])
  const [accounts, setAccounts] = useState<InstagramAccount[]>([])
  const [appId, setAppId] = useState("")
  const [appSecret, setAppSecret] = useState("")
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
  const canConnect =
    Boolean(selectedAppId) && /^[a-z0-9._]{1,30}$/.test(normalizedUsername)

  const loadData = async (preferredAppId?: string) => {
    try {
      const [appResponse, accountsResponse] = await Promise.all([
        fetch("/api/instagram/meta-app", { cache: "no-store" }),
        fetch("/api/instagram/accounts", { cache: "no-store" }),
      ])

      const appData = await appResponse.json()
      const accountsData = await accountsResponse.json()

      if (!appResponse.ok) {
        throw new Error(appData.error || "Não foi possível carregar os Apps Meta.")
      }

      if (!accountsResponse.ok) {
        throw new Error(accountsData.error || "Não foi possível carregar as contas.")
      }

      const loadedApps: MetaApp[] = Array.isArray(appData.apps)
        ? appData.apps
        : []

      setMetaData(appData)
      setApps(loadedApps)
      setAccounts(Array.isArray(accountsData) ? accountsData : [])
      setSelectedAppId((current) => {
        const requested = preferredAppId || current
        if (requested && loadedApps.some((app) => app.id === requested)) {
          return requested
        }
        return loadedApps[0]?.id || ""
      })
    } catch (loadError) {
      toast.error(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar a configuração.",
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
        toast.error(
          `Você informou @${result.expected || "outra_conta"}, mas autorizou @${result.connected || "outra_conta"}. Tente novamente com a conta correta.`
        )
      } else {
        toast.error(
          result.callbackMessage ||
            errorMessages[result.errorCode] ||
            "Erro ao conectar a conta."
        )
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
      ? {
          eventId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          success,
          errorCode,
          callbackMessage,
          connectedUsername,
          expected,
          connected,
          appConfigId: callbackAppConfigId,
        }
      : null

    const processOAuthResult = (result: OAuthResult) => {
      if (!result?.eventId || handledOAuthEventRef.current === result.eventId) {
        return
      }

      handledOAuthEventRef.current = result.eventId
      if (result.success === "connected") {
        setUsername("")
      }
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

      try {
        processOAuthResult(JSON.parse(event.newValue) as OAuthResult)
      } catch {
        // Ignora mensagens inválidas de outras abas.
      }
    }

    const handleFocus = () => {
      void loadData()
    }

    window.addEventListener("storage", handleStorage)
    window.addEventListener("focus", handleFocus)

    if (isOAuthPopup && callbackResult) {
      try {
        channel?.postMessage(callbackResult)
      } catch {
        // O evento de storage e o refresh no foco continuam como fallback.
      }

      try {
        localStorage.setItem(OAUTH_STORAGE_KEY, JSON.stringify(callbackResult))
        localStorage.removeItem(OAUTH_STORAGE_KEY)
      } catch {
        // O refresh no foco da aba principal ainda atualiza os dados.
      }

      window.history.replaceState({}, "", "/dashboard/meta-app")
      window.close()

      const closeFallbackTimer = window.setTimeout(() => {
        if (!window.closed) {
          processOAuthResult(callbackResult)
        }
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
      if (callbackResult.success === "connected") {
        setUsername("")
      }
      showOAuthResultToast(callbackResult)
    }

    if (hasOAuthResult) {
      window.history.replaceState({}, "", "/dashboard/meta-app")
    }

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
    setShowSecret(false)
  }

  const saveApp = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      const response = await fetch("/api/instagram/meta-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          configId: editingAppId,
          appId,
          appSecret,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível salvar o App Meta.")
      }

      const savedConfigId = String(data.configId || "")
      resetForm()
      toast.success(
        editingAppId
          ? "App Meta atualizado com sucesso."
          : "App Meta adicionado com sucesso."
      )
      await loadData(savedConfigId || undefined)
    } catch (saveError) {
      toast.error(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar o App Meta."
      )
    } finally {
      setSaving(false)
    }
  }

  const editApp = (app: MetaApp) => {
    setEditingAppId(app.id)
    setAppId(app.appId)
    setAppSecret("")
    setShowSecret(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const deleteApp = async (app: MetaApp) => {
    const confirmed = await confirmToast(
      `Excluir o App Meta ${maskAppId(app.appId)}?`,
      {
        confirmLabel: "Excluir",
        danger: true,
      }
    )
    if (!confirmed) return

    setDeletingId(app.id)
    try {
      const response = await fetch("/api/instagram/meta-app", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configId: app.id }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível excluir o App Meta.")
      }

      if (editingAppId === app.id) resetForm()
      toast.success("App Meta removido.")
      await loadData()
    } catch (deleteError) {
      toast.error(
        deleteError instanceof Error
          ? deleteError.message
          : "Não foi possível excluir o App Meta."
      )
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
    if (!configured) {
      toast.error("Adicione um App Meta antes de conectar uma conta.")
      return
    }
    if (!selectedAppId) {
      toast.error("Escolha qual App Meta será usado nesta conta.")
      return
    }
    if (!canConnect) {
      toast.error("Informe um usuário do Instagram válido.")
      return
    }

    const params = new URLSearchParams({
      username: normalizedUsername,
      appConfigId: selectedAppId,
    })
    const sameTabUrl = `/api/instagram/oauth/start?${params.toString()}`
    const authTab = window.open("about:blank", "_blank")

    if (!authTab) {
      toast.error(
        "O navegador bloqueou a nova aba. A autorização será aberta nesta aba."
      )
      window.location.href = sameTabUrl
      return
    }

    try {
      authTab.opener = null
    } catch {
      // Alguns navegadores não permitem alterar opener; o fluxo continua normal.
    }

    params.set("popup", "1")
    const popupUrl = new URL(
      `/api/instagram/oauth/start?${params.toString()}`,
      window.location.origin
    ).toString()

    try {
      authTab.location.href = popupUrl
    } catch {
      authTab.close()
      window.location.href = sameTabUrl
    }
  }

  const removeAccount = async (id: string) => {
    const confirmed = await confirmToast("Remover esta conta conectada?", {
      confirmLabel: "Remover",
      danger: true,
    })
    if (!confirmed) return

    try {
      const response = await fetch("/api/instagram/accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível remover a conta.")
      }

      toast.success("Conta removida.")
      await loadData(selectedAppId)
    } catch (removeError) {
      toast.error(
        removeError instanceof Error
          ? removeError.message
          : "Não foi possível remover a conta."
      )
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
        <p className="text-gray-500 mt-1">
          Cadastre vários Apps Meta e escolha qual deles será usado em cada
          conexão do Instagram.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="bg-[#111] border border-white/5 rounded-2xl p-5">
          <p className="text-xs text-gray-500">Apps configurados</p>
          <p className="text-2xl text-white font-bold mt-1">{apps.length}</p>
        </div>
        <div className="bg-[#111] border border-white/5 rounded-2xl p-5">
          <p className="text-xs text-gray-500">Contas conectadas</p>
          <p className="text-2xl text-white font-bold mt-1">
            {metaData?.accountsCount || 0}
          </p>
        </div>
        <div className="bg-[#111] border border-white/5 rounded-2xl p-5">
          <p className="text-xs text-gray-500">App selecionado</p>
          <p className="text-lg text-white font-semibold mt-1">
            {selectedApp ? maskAppId(selectedApp.appId) : "—"}
          </p>
        </div>
      </div>

      <div className="space-y-5">
        <section className="bg-[#111] border border-white/5 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-white font-semibold">Redirect URI compartilhada</h2>
              <p className="text-xs text-gray-500 mt-1">
                Cadastre esta mesma URL em todos os Apps Meta adicionados aqui.
              </p>
            </div>
            <button
              onClick={copyRedirectUri}
              className="inline-flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300"
            >
              <Clipboard size={13} />
              Copiar
            </button>
          </div>
          <div className="bg-white/[0.025] border border-white/5 rounded-xl p-4">
            <p className="text-xs sm:text-sm text-gray-300 break-all font-mono">
              {metaData?.redirectUri || "—"}
            </p>
            <p className="text-[11px] text-gray-600 mt-2">
              Business login settings → OAuth redirect URIs.
            </p>
          </div>
        </section>

        <section className="bg-[#111] border border-white/5 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-white font-semibold">
                {editingAppId ? "Editar App Meta" : "Adicionar App Meta"}
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Use o Instagram App ID e o Instagram App Secret do produto
                Instagram.
              </p>
            </div>
            <ShieldCheck size={20} className="text-purple-400" />
          </div>

          <form onSubmit={saveApp} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Instagram App ID
                </label>
                <div className="relative">
                  <Instagram
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                    size={16}
                  />
                  <input
                    value={appId}
                    onChange={(event) =>
                      setAppId(event.target.value.replace(/\D/g, ""))
                    }
                    required
                    inputMode="numeric"
                    placeholder="1784..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  App Secret
                </label>
                <div className="relative">
                  <KeyRound
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                    size={16}
                  />
                  <input
                    type={showSecret ? "text" : "password"}
                    value={appSecret}
                    onChange={(event) => setAppSecret(event.target.value)}
                    required={!editingAppId}
                    placeholder={
                      editingAppId
                        ? "Deixe vazio para manter o secret atual"
                        : "Instagram App Secret"
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-11 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((current) => !current)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                    aria-label={showSecret ? "Ocultar secret" : "Mostrar secret"}
                  >
                    {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-semibold px-5 py-3 rounded-xl hover:opacity-90 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : editingAppId ? (
                  <Save size={15} />
                ) : (
                  <Plus size={15} />
                )}
                {saving
                  ? "Salvando..."
                  : editingAppId
                    ? "Salvar alterações"
                    : "Adicionar app"}
              </button>

              {editingAppId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-gray-300 text-sm font-medium px-5 py-3 rounded-xl hover:bg-white/10"
                >
                  <X size={15} />
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="bg-[#111] border border-white/5 rounded-2xl p-6">
          <div className="mb-5">
            <h2 className="text-white font-semibold">Seus Apps Meta</h2>
            <p className="text-xs text-gray-500 mt-1">
              Cada conta fica vinculada ao App Meta usado durante o OAuth.
            </p>
          </div>

          {apps.length === 0 ? (
            <div className="border border-dashed border-white/10 rounded-xl py-10 text-center">
              <Instagram size={24} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Nenhum App Meta cadastrado.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {apps.map((app, index) => {
                const selected = app.id === selectedAppId
                return (
                  <div
                    key={app.id}
                    className={`rounded-xl border p-4 transition-colors ${
                      selected
                        ? "border-purple-500/40 bg-purple-500/[0.06]"
                        : "border-white/[0.07] bg-white/[0.025]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 text-xs font-semibold flex items-center justify-center shrink-0">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white">
                            App Meta {index + 1}
                          </p>
                          <p className="text-xs text-gray-500 font-mono">
                            {maskAppId(app.appId)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => editApp(app)}
                          className="p-2 text-gray-500 hover:text-purple-400 hover:bg-purple-500/10 rounded-lg"
                          aria-label="Editar App Meta"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => deleteApp(app)}
                          disabled={deletingId === app.id}
                          className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg disabled:opacity-50"
                          aria-label="Excluir App Meta"
                        >
                          {deletingId === app.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs mb-4">
                      <div>
                        <p className="text-gray-600">Contas</p>
                        <p className="text-white font-medium mt-1">
                          {app.accountsCount}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">Última validação</p>
                        <p className="text-gray-300 mt-1">
                          {formatDate(app.lastValidatedAt)}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedAppId(app.id)}
                      className={`w-full inline-flex items-center justify-center gap-2 text-xs font-semibold py-2.5 rounded-lg border ${
                        selected
                          ? "bg-purple-500/15 border-purple-500/30 text-purple-300"
                          : "bg-white/[0.03] border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.06]"
                      }`}
                    >
                      {selected ? <Check size={13} /> : <PlugZap size={13} />}
                      {selected ? "Selecionado" : "Usar para conectar"}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="bg-[#111] border border-white/5 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-white font-semibold">Conectar conta</h2>
              <p className="text-xs text-gray-500 mt-1">
                Escolha explicitamente o App Meta que fará a autorização OAuth.
              </p>
            </div>
            <UserPlus size={20} className="text-purple-400" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 mb-5">
            <select
              value={selectedAppId}
              onChange={(event) => setSelectedAppId(event.target.value)}
              disabled={apps.length === 0}
              className="w-full bg-[#181818] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 disabled:opacity-50"
            >
              {apps.length === 0 ? (
                <option value="">Nenhum App Meta</option>
              ) : (
                apps.map((app, index) => (
                  <option key={app.id} value={app.id}>
                    App Meta {index + 1} · {maskAppId(app.appId)}
                  </option>
                ))
              )}
            </select>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                @
              </span>
              <input
                value={username}
                onChange={(event) =>
                  setUsername(event.target.value.replace(/^@/, ""))
                }
                placeholder="usuario"
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
              />
            </div>

            <button
              onClick={connectAccount}
              disabled={!canConnect}
              className="inline-flex items-center justify-center gap-2 bg-purple-500/20 border border-purple-500/30 text-purple-300 text-sm font-semibold px-5 py-3 rounded-xl hover:bg-purple-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <PlugZap size={15} />
              Conectar conta
            </button>
          </div>

          {selectedApp && (
            <p className="text-[11px] text-gray-600 mb-5">
              A conta será vinculada ao App Meta {maskAppId(selectedApp.appId)}.
            </p>
          )}

          <div className="mb-3">
            <h3 className="text-sm font-medium text-white">
              Contas do app selecionado
            </h3>
          </div>

          {selectedAccounts.length === 0 ? (
            <div className="border border-dashed border-white/10 rounded-xl py-9 text-center">
              <Instagram size={22} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">
                Nenhuma conta conectada por este App Meta.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedAccounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center gap-3 bg-white/[0.025] border border-white/5 rounded-xl p-3.5"
                >
                  {account.profilePicture ? (
                    <img
                      src={account.profilePicture}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <Instagram size={16} className="text-white" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">
                      @{account.username}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {account.accountType || "Conta profissional"}
                      {account.followerCount !== null
                        ? ` · ${account.followerCount.toLocaleString("pt-BR")} seguidores`
                        : ""}
                    </p>
                    {account.requiresReconnect && account.autoDeleteAt && (
                      <p className="text-[10px] text-red-300/70 mt-0.5 truncate">
                        Reconecte até {formatDate(account.autoDeleteAt)} ou a conta
                        será removida.
                      </p>
                    )}
                  </div>
                  <span
                    className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] ${
                      account.isActive && !account.requiresReconnect
                        ? "bg-green-500/10 text-green-400"
                        : "bg-red-500/10 text-red-400"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        account.isActive && !account.requiresReconnect
                          ? "bg-green-400"
                          : "bg-red-400"
                      }`}
                    />
                    {account.isActive && !account.requiresReconnect
                      ? "Conectada"
                      : "Reconectar"}
                  </span>
                  <button
                    onClick={() => removeAccount(account.id)}
                    className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg"
                    aria-label="Remover conta"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-[#111] border border-white/5 rounded-2xl p-6">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="text-white font-semibold">Como configurar</h2>
              <p className="text-xs text-gray-500 mt-1">
                Repita a configuração para cada App Meta cadastrado.
              </p>
            </div>
            <a
              href="https://developers.facebook.com/apps/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300"
            >
              Abrir Meta Developers
              <ExternalLink size={12} />
            </a>
          </div>

          <ol className="space-y-3 text-sm text-gray-400">
            {[
              "Crie o App Meta e adicione o produto Instagram com Instagram Login.",
              "Em Business login settings, cadastre exatamente a Redirect URI compartilhada desta página.",
              "Copie o Instagram App ID e o Instagram App Secret e adicione o app aqui.",
              "Adicione a conta como Instagram Tester no App Meta correto e aceite o convite.",
              "Na seção Conectar conta, selecione esse App Meta, informe o @ e faça o OAuth.",
            ].map((item, index) => (
              <li key={item} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-purple-500/10 text-purple-400 text-xs font-semibold flex items-center justify-center shrink-0">
                  {index + 1}
                </span>
                <span className="pt-0.5">{item}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}
