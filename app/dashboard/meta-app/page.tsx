"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  Check,
  CheckCircle,
  Clipboard,
  ExternalLink,
  Eye,
  EyeOff,
  Instagram,
  KeyRound,
  Loader2,
  PlugZap,
  Save,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react"

type MetaAppData = {
  configured: boolean
  appId: string
  secretConfigured: boolean
  lastValidatedAt: string | null
  createdAt: string | null
  updatedAt: string | null
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
  appId: string | null
}

const errorMessages: Record<string, string> = {
  app_not_configured: "Salve o Instagram App ID e o App Secret antes de conectar uma conta.",
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

export default function MetaAppPage() {
  const [app, setApp] = useState<MetaAppData | null>(null)
  const [accounts, setAccounts] = useState<InstagramAccount[]>([])
  const [appId, setAppId] = useState("")
  const [appSecret, setAppSecret] = useState("")
  const [username, setUsername] = useState("")
  const [showSecret, setShowSecret] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copying, setCopying] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const configured = Boolean(app?.configured)
  const canConnect = configured && /^[a-zA-Z0-9._]{1,30}$/.test(username.replace(/^@/, ""))

  const visibleAppId = useMemo(() => {
    if (!app?.appId) return "—"
    if (app.appId.length <= 8) return app.appId
    return `${app.appId.slice(0, 4)}…${app.appId.slice(-4)}`
  }, [app?.appId])

  const loadData = async () => {
    try {
      const [appResponse, accountsResponse] = await Promise.all([
        fetch("/api/instagram/meta-app", { cache: "no-store" }),
        fetch("/api/instagram/accounts", { cache: "no-store" }),
      ])

      const appData = await appResponse.json()
      const accountsData = await accountsResponse.json()

      if (!appResponse.ok) {
        throw new Error(appData.error || "Não foi possível carregar o App Meta.")
      }

      if (!accountsResponse.ok) {
        throw new Error(accountsData.error || "Não foi possível carregar as contas.")
      }

      setApp(appData)
      setAppId(appData.appId || "")
      setAccounts(Array.isArray(accountsData) ? accountsData : [])
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar a configuração."
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()

    const params = new URLSearchParams(window.location.search)
    const success = params.get("success")
    const errorCode = params.get("error")
    const callbackMessage = params.get("message")
    const connectedUsername = params.get("username")
    const expected = params.get("expected")
    const connected = params.get("connected")

    if (success === "connected") {
      setMessage(
        connectedUsername
          ? `@${connectedUsername} conectada com sucesso pelo App Meta.`
          : "Conta conectada com sucesso pelo App Meta."
      )
    }

    if (errorCode) {
      if (errorCode === "wrong_account") {
        setError(
          `Você informou @${expected || "outra_conta"}, mas autorizou @${connected || "outra_conta"}. Tente novamente com a conta correta.`
        )
      } else {
        setError(callbackMessage || errorMessages[errorCode] || "Erro ao conectar a conta.")
      }
    }

    if (success || errorCode) {
      window.history.replaceState({}, "", "/dashboard/meta-app")
    }
  }, [])

  const saveApp = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)

    try {
      const response = await fetch("/api/instagram/meta-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId, appSecret }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível salvar o App Meta.")
      }

      setAppSecret("")
      setMessage("App Meta salvo. Agora adicione a Redirect URI e os Instagram Testers no painel da Meta.")
      await loadData()
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar o App Meta."
      )
    } finally {
      setSaving(false)
    }
  }

  const deleteApp = async () => {
    if (!confirm("Excluir a configuração do App Meta?")) return

    setDeleting(true)
    setError(null)
    setMessage(null)

    try {
      const response = await fetch("/api/instagram/meta-app", {
        method: "DELETE",
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível excluir o App Meta.")
      }

      setAppId("")
      setAppSecret("")
      setMessage("Configuração do App Meta removida.")
      await loadData()
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Não foi possível excluir o App Meta."
      )
    } finally {
      setDeleting(false)
    }
  }

  const copyRedirectUri = async () => {
    if (!app?.redirectUri) return

    await navigator.clipboard.writeText(app.redirectUri)
    setCopying(true)
    window.setTimeout(() => setCopying(false), 1500)
  }

  const connectAccount = () => {
    if (!canConnect) return
    const normalized = username.trim().replace(/^@/, "").toLowerCase()
    window.location.href = `/api/instagram/oauth/start?username=${encodeURIComponent(normalized)}`
  }

  const removeAccount = async (id: string) => {
    if (!confirm("Remover esta conta conectada?")) return

    setError(null)

    const response = await fetch("/api/instagram/accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(data.error || "Não foi possível remover a conta.")
      return
    }

    setMessage("Conta removida.")
    await loadData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-purple-400" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">App Meta</h1>
        <p className="text-gray-500 mt-1">
          Use o App Meta de Development do seu negócio para conectar contas profissionais em modo de teste.
        </p>
      </div>

      {message && (
        <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-6">
          <CheckCircle size={17} className="text-green-400" />
          <p className="text-green-300 text-sm">{message}</p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <AlertCircle size={17} className="text-red-400" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      <div className="space-y-5">
        <section className="bg-[#111] border border-white/5 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-white font-semibold">Seu App Meta</h2>
              <p className="text-xs text-gray-500 mt-1">
                Credenciais próprias do usuário. O App Secret fica criptografado no banco.
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
                configured
                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                  : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${configured ? "bg-green-400" : "bg-yellow-400"}`} />
              {configured ? "Configurado" : "Não configurado"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-white/[0.025] border border-white/5 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Instagram App ID</p>
              <p className="text-white font-medium">{visibleAppId}</p>
            </div>
            <div className="bg-white/[0.025] border border-white/5 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Contas conectadas</p>
              <p className="text-white font-medium">{app?.accountsCount || 0}</p>
            </div>
            <div className="col-span-2 bg-white/[0.025] border border-white/5 rounded-xl p-4">
              <div className="flex items-center justify-between gap-4 mb-2">
                <p className="text-xs text-gray-500">Redirect URI</p>
                <button
                  onClick={copyRedirectUri}
                  className="inline-flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300"
                >
                  {copying ? <Check size={13} /> : <Clipboard size={13} />}
                  {copying ? "Copiada" : "Copiar"}
                </button>
              </div>
              <p className="text-xs sm:text-sm text-gray-300 break-all font-mono">
                {app?.redirectUri}
              </p>
              <p className="text-[11px] text-gray-600 mt-2">
                Cole exatamente esta URL em Business login settings → OAuth redirect URIs.
              </p>
            </div>
            <div className="bg-white/[0.025] border border-white/5 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Última validação</p>
              <p className="text-white font-medium">{formatDate(app?.lastValidatedAt || null)}</p>
            </div>
            <div className="bg-white/[0.025] border border-white/5 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">App Secret</p>
              <p className="text-white font-medium">
                {app?.secretConfigured ? "Salvo e criptografado" : "—"}
              </p>
            </div>
          </div>
        </section>

        <section className="bg-[#111] border border-white/5 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-white font-semibold">Salvar App Meta</h2>
              <p className="text-xs text-gray-500 mt-1">
                Use o Instagram App ID e o Instagram App Secret, não credenciais de outro produto.
              </p>
            </div>
            <ShieldCheck size={20} className="text-purple-400" />
          </div>

          <form onSubmit={saveApp} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Instagram App ID
              </label>
              <div className="relative">
                <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                <input
                  value={appId}
                  onChange={(event) => setAppId(event.target.value.replace(/\D/g, ""))}
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
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                <input
                  type={showSecret ? "text" : "password"}
                  value={appSecret}
                  onChange={(event) => setAppSecret(event.target.value)}
                  required={!configured}
                  placeholder={configured ? "Deixe vazio para manter o secret atual" : "Instagram App Secret"}
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

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-semibold px-5 py-3 rounded-xl hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {saving ? "Salvando..." : "Salvar app"}
              </button>

              {configured && (
                <button
                  type="button"
                  onClick={deleteApp}
                  disabled={deleting}
                  className="inline-flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium px-5 py-3 rounded-xl hover:bg-red-500/15 disabled:opacity-50"
                >
                  {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  Excluir
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="bg-[#111] border border-white/5 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-white font-semibold">Contas deste app</h2>
              <p className="text-xs text-gray-500 mt-1">
                Adicione a conta como Instagram Tester no app Meta e aceite o convite antes de conectar.
              </p>
            </div>
            <UserPlus size={20} className="text-purple-400" />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">@</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value.replace(/^@/, ""))}
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

          {accounts.length === 0 ? (
            <div className="border border-dashed border-white/10 rounded-xl py-10 text-center">
              <Instagram size={24} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Nenhuma conta oficial conectada.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map((account) => (
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
                    <p className="text-sm font-medium text-white truncate">@{account.username}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {account.accountType || "Conta profissional"}
                      {account.followerCount !== null
                        ? ` · ${account.followerCount.toLocaleString("pt-BR")} seguidores`
                        : ""}
                    </p>
                    {account.requiresReconnect && account.autoDeleteAt && (
                      <p className="text-[10px] text-red-300/70 mt-0.5 truncate">
                        Reconecte até {formatDate(account.autoDeleteAt)} ou a conta será removida.
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
                    <span className={`w-1.5 h-1.5 rounded-full ${account.isActive && !account.requiresReconnect ? "bg-green-400" : "bg-red-400"}`} />
                    {account.isActive && !account.requiresReconnect ? "Conectada" : "Reconectar"}
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
              <p className="text-xs text-gray-500 mt-1">Fluxo BYOA oficial da Meta.</p>
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
              "Crie um app em developers.facebook.com e mantenha-o em modo Development durante os testes.",
              "Adicione o produto Instagram e escolha API setup with Instagram login.",
              "Em Business login settings, cole exatamente a Redirect URI mostrada nesta página.",
              "Copie o Instagram App ID e o Instagram App Secret exibidos no produto Instagram.",
              "Adicione as contas em Roles como Instagram Testers e aceite o convite na conta do Instagram.",
              "Salve o app aqui, informe o @ da conta e clique em Conectar conta.",
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
