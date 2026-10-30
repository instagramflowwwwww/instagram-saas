"use client"
import { useEffect, useState } from "react"
import { useSession, signOut } from "next-auth/react"
import { User, Lock, LogOut, Save, Eye, EyeOff, Bell, BellOff, BellRing, KeyRound, Plus, Copy, Check, Trash2, Loader2, Sun, Moon, Monitor, Palette } from "lucide-react"
import toast from "react-hot-toast"
import {
  disablePush,
  enablePush,
  getCurrentPushSubscription,
  isPushSupported,
} from "@/lib/push-client"
import { useTheme, type ThemePreference } from "@/lib/theme"

type PushStatus = "loading" | "unsupported" | "off" | "on"

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
]

function AppearanceCard() {
  const { preference, setPreference } = useTheme()

  return (
    <div className="bg-theme-surface border border-theme-border rounded-xl p-6">
      <div className="flex items-center gap-2 mb-2">
        <Palette size={16} className="text-purple-400" />
        <h2 className="font-semibold text-theme-text text-sm">Aparência</h2>
      </div>
      <p className="text-sm text-theme-text-muted mb-5">
        Escolha como o InstaFlow aparece neste aparelho. "Sistema" segue a configuração do seu
        celular ou computador automaticamente.
      </p>

      <div className="grid grid-cols-3 gap-3">
        {THEME_OPTIONS.map((option) => {
          const active = preference === option.value
          return (
            <button
              key={option.value}
              onClick={() => setPreference(option.value)}
              className={`flex flex-col items-center gap-2 rounded-lg border px-3 py-4 text-sm font-medium transition-colors ${
                active
                  ? "border-purple-500 bg-purple-500/10 text-purple-400"
                  : "border-theme-border text-theme-text-secondary hover:bg-theme-surface-2"
              }`}
            >
              <option.icon size={18} />
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function NotificationsCard() {
  const [status, setStatus] = useState<PushStatus>("loading")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isPushSupported()) {
      setStatus("unsupported")
      return
    }
    getCurrentPushSubscription()
      .then((subscription) => setStatus(subscription ? "on" : "off"))
      .catch(() => setStatus("off"))
  }, [])

  const toggle = async () => {
    setBusy(true)
    try {
      if (status === "on") {
        await disablePush()
        setStatus("off")
        toast.success("Notificações desativadas neste aparelho.")
      } else {
        const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!publicKey) throw new Error("Notificações não configuradas no servidor.")
        await enablePush(publicKey)
        setStatus("on")
        toast.success("Notificações ativadas neste aparelho.")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível mudar a notificação.")
    } finally {
      setBusy(false)
    }
  }

  const sendTest = async () => {
    setBusy(true)
    try {
      const res = await fetch("/api/push/test", { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Não foi possível enviar o teste.")
      toast.success("Teste enviado — confira a notificação.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o teste.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-[#111] border border-white/5 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-2">
        <BellRing size={16} className="text-purple-400" />
        <h2 className="font-semibold text-white text-sm">Notificações</h2>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Ativa os avisos neste aparelho — vídeo bombando, queda de contas, meta de views e o resumo
        diário, todos ajustáveis no card "Alertas personalizados" abaixo. No iPhone, funciona
        depois de adicionar o InstaFlow à Tela de Início pelo Safari.
      </p>

      {status === "unsupported" ? (
        <p className="text-sm text-gray-500">Este navegador não aceita notificações push.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={toggle}
            disabled={busy || status === "loading"}
            className={`flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50 ${
              status === "on"
                ? "bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300"
                : "bg-purple-600 hover:bg-purple-700 text-white"
            }`}
          >
            {status === "on" ? <BellOff size={14} /> : <Bell size={14} />}
            {status === "loading"
              ? "Verificando..."
              : status === "on"
                ? "Desativar notificações"
                : "Ativar notificações"}
          </button>

          {status === "on" && (
            <button
              onClick={sendTest}
              disabled={busy}
              className="text-sm text-gray-400 hover:text-white px-3 py-2.5 disabled:opacity-50"
            >
              Enviar notificação de teste
            </button>
          )}
        </div>
      )}
    </div>
  )
}

type AlertPreferences = {
  massDisconnectEnabled: boolean
  massDisconnectThreshold: number
  viralEnabled: boolean
  viralViewsThreshold: number
  viewsGoalEnabled: boolean
  dailyViewsGoal: number | null
  digestEnabled: boolean
}

function AlertPreferencesCard() {
  const [prefs, setPrefs] = useState<AlertPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/user/notification-preferences")
      .then((res) => res.json())
      .then((data) => setPrefs(data.preferences))
      .catch(() => toast.error("Não foi possível carregar as preferências de alerta."))
      .finally(() => setLoading(false))
  }, [])

  const update = (patch: Partial<AlertPreferences>) => {
    setPrefs((current) => (current ? { ...current, ...patch } : current))
  }

  const save = async () => {
    if (!prefs) return
    setSaving(true)
    try {
      const res = await fetch("/api/user/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.")
      setPrefs(data.preferences)
      toast.success("Preferências de alerta salvas.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.")
    } finally {
      setSaving(false)
    }
  }

  if (loading || !prefs) {
    return (
      <div className="bg-[#111] border border-white/5 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-2">
          <Bell size={16} className="text-purple-400" />
          <h2 className="font-semibold text-white text-sm">Alertas personalizados</h2>
        </div>
        <p className="text-sm text-gray-500">Carregando preferências...</p>
      </div>
    )
  }

  return (
    <div className="bg-[#111] border border-white/5 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-2">
        <Bell size={16} className="text-purple-400" />
        <h2 className="font-semibold text-white text-sm">Alertas personalizados</h2>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Ajuste quando cada aviso dispara. Só funciona com as notificações ativadas no card acima.
      </p>

      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-white cursor-pointer select-none">
              <input
                type="checkbox"
                checked={prefs.massDisconnectEnabled}
                onChange={(e) => update({ massDisconnectEnabled: e.target.checked })}
                className="h-4 w-4 rounded border-white/20 bg-white/5 accent-purple-500"
              />
              Queda em massa de contas
            </label>
            <p className="text-xs text-gray-500 mt-1 ml-6">
              Avisa quando várias contas desconectam de uma vez (janela de 30 minutos).
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="number"
              min={1}
              disabled={!prefs.massDisconnectEnabled}
              value={prefs.massDisconnectThreshold}
              onChange={(e) => update({ massDisconnectThreshold: Number(e.target.value) || 1 })}
              className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-purple-500 disabled:opacity-40"
            />
            <span className="text-xs text-gray-500">contas</span>
          </div>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-white cursor-pointer select-none">
              <input
                type="checkbox"
                checked={prefs.viralEnabled}
                onChange={(e) => update({ viralEnabled: e.target.checked })}
                className="h-4 w-4 rounded border-white/20 bg-white/5 accent-purple-500"
              />
              Vídeo bombando
            </label>
            <p className="text-xs text-gray-500 mt-1 ml-6">A partir de quantas visualizações avisar.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="number"
              min={1000}
              step={1000}
              disabled={!prefs.viralEnabled}
              value={prefs.viralViewsThreshold}
              onChange={(e) => update({ viralViewsThreshold: Number(e.target.value) || 1000 })}
              className="w-24 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-purple-500 disabled:opacity-40"
            />
            <span className="text-xs text-gray-500">views</span>
          </div>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-white cursor-pointer select-none">
              <input
                type="checkbox"
                checked={prefs.viewsGoalEnabled}
                onChange={(e) => update({ viewsGoalEnabled: e.target.checked })}
                className="h-4 w-4 rounded border-white/20 bg-white/5 accent-purple-500"
              />
              Meta de views do dia
            </label>
            <p className="text-xs text-gray-500 mt-1 ml-6">
              Avisa uma vez quando a soma de views do dia bater a meta.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="number"
              min={1}
              step={1000}
              disabled={!prefs.viewsGoalEnabled}
              value={prefs.dailyViewsGoal ?? 50000}
              onChange={(e) => update({ dailyViewsGoal: Number(e.target.value) || 1 })}
              className="w-24 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-purple-500 disabled:opacity-40"
            />
            <span className="text-xs text-gray-500">views/dia</span>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-white cursor-pointer select-none">
            <input
              type="checkbox"
              checked={prefs.digestEnabled}
              onChange={(e) => update({ digestEnabled: e.target.checked })}
              className="h-4 w-4 rounded border-white/20 bg-white/5 accent-purple-500"
            />
            Resumo diário de performance
          </label>
          <p className="text-xs text-gray-500 mt-1 ml-6">
            Total de views do dia, enviado às 08h, 12h, 14h, 18h e 22h.
          </p>
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="mt-6 flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
      >
        <Save size={14} />
        {saving ? "Salvando..." : "Salvar preferências"}
      </button>
    </div>
  )
}

type ApiToken = {
  id: string
  name: string
  tokenPreview: string
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

function formatTokenDate(value: string | null) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
}

function ApiTokensCard() {
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [freshToken, setFreshToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = async () => {
    try {
      const res = await fetch("/api/tokens", { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Não foi possível carregar os tokens.")
      setTokens(Array.isArray(data.tokens) ? data.tokens : [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar os tokens.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const createToken = async () => {
    setCreating(true)
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Token de automação" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Não foi possível gerar o token.")
      setFreshToken(data.token)
      setCopied(false)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o token.")
    } finally {
      setCreating(false)
    }
  }

  const revokeToken = async (token: ApiToken) => {
    setRevokingId(token.id)
    try {
      const res = await fetch("/api/tokens", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: token.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Não foi possível revogar o token.")
      toast.success("Token revogado.")
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível revogar o token.")
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <div className="bg-[#111] border border-white/5 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-2">
        <KeyRound size={16} className="text-purple-400" />
        <h2 className="font-semibold text-white text-sm">Tokens de API</h2>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Use um token <code className="text-gray-400">ifk_...</code> para autenticar automações externas
        via <code className="text-gray-400">Authorization: Bearer</code> nas rotas <code className="text-gray-400">/api/v1/*</code>,
        sem precisar de login/senha.
      </p>

      {freshToken && (
        <div className="mb-5 rounded-lg border border-purple-500/20 bg-purple-500/[0.06] p-4">
          <p className="text-xs text-gray-400 mb-2">
            Copie agora — esse valor não aparece de novo depois que você sair daqui.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 select-all font-mono text-xs sm:text-sm text-white break-all">{freshToken}</code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(freshToken)
                setCopied(true)
                toast.success("Token copiado.")
              }}
              className="shrink-0 rounded-lg p-1.5 text-purple-300 hover:bg-purple-500/15"
              aria-label="Copiar token"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      )}

      <button
        onClick={createToken}
        disabled={creating}
        className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors mb-5"
      >
        {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        Gerar novo token
      </button>

      {loading ? (
        <p className="text-sm text-gray-600">Carregando...</p>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-gray-600">Nenhum token gerado ainda.</p>
      ) : (
        <div className="space-y-2">
          {tokens.map((token) => {
            const revoked = Boolean(token.revokedAt)
            return (
              <div key={token.id} className="flex items-center gap-3 bg-white/[0.025] border border-white/5 rounded-lg p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white font-mono truncate">{token.tokenPreview}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {revoked
                      ? `Revogado em ${formatTokenDate(token.revokedAt)}`
                      : `Criado em ${formatTokenDate(token.createdAt)} · Último uso: ${formatTokenDate(token.lastUsedAt)}`}
                  </p>
                </div>
                {!revoked && (
                  <button
                    onClick={() => revokeToken(token)}
                    disabled={revokingId === token.id}
                    className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg disabled:opacity-50"
                    aria-label="Revogar token"
                  >
                    {revokingId === token.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { data: session, update } = useSession()
  const [name, setName] = useState(session?.user?.name || "")
  const [savingName, setSavingName] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  const saveName = async () => {
    if (!name.trim()) {
      toast.error("Informe um nome.")
      return
    }

    setSavingName(true)
    try {
      const res = await fetch("/api/user/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar o nome.")

      await update({ name })
      toast.success("Nome salvo com sucesso.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o nome.")
    } finally {
      setSavingName(false)
    }
  }

  const savePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Preencha todos os campos")
      return
    }
    if (newPassword.length < 6) {
      toast.error("A nova senha deve ter pelo menos 6 caracteres")
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem")
      return
    }

    setSavingPassword(true)
    try {
      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Erro ao alterar senha")

      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      toast.success("Senha alterada com sucesso.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao alterar senha")
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Configurações</h1>
        <p className="text-gray-500 mt-1">Gerencie sua conta</p>
      </div>
      <div className="max-w-xl space-y-4">
        <div className="bg-[#111] border border-white/5 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <User size={16} className="text-purple-400" />
            <h2 className="font-semibold text-white text-sm">Informações pessoais</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Email</label>
              <input
                type="email"
                value={session?.user?.email || ""}
                disabled
                className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-2.5 text-sm text-gray-500 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Nome</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
              />
            </div>
            <button
              onClick={saveName}
              disabled={savingName}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              <Save size={14} />
              {savingName ? "Salvando..." : "Salvar nome"}
            </button>
          </div>
        </div>
        <div className="bg-[#111] border border-white/5 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Lock size={16} className="text-purple-400" />
            <h2 className="font-semibold text-white text-sm">Alterar senha</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Senha atual</label>
              <div className="relative">
                <input
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 pr-10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
                />
                <button onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                  {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Nova senha</label>
              <div className="relative">
                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 pr-10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
                />
                <button onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                  {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Confirmar nova senha</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
              />
            </div>
            <button
              onClick={savePassword}
              disabled={savingPassword}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              <Save size={14} />
              {savingPassword ? "Salvando..." : "Alterar senha"}
            </button>
          </div>
        </div>

        <AppearanceCard />

        <NotificationsCard />

        <AlertPreferencesCard />

        <ApiTokensCard />

        <div className="bg-[#111] border border-white/5 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <LogOut size={16} className="text-red-400" />
            <h2 className="font-semibold text-white text-sm">Sair da conta</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">Você será desconectado e redirecionado para a página de login.</p>
          <button
            onClick={() => {
              toast.success("Sessão encerrada.")
              void signOut({ callbackUrl: "/login" })
            }}
            className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            <LogOut size={14} />
            Sair da conta
          </button>
        </div>
      </div>
    </div>
  )
}
