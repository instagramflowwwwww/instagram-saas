"use client"
import { useEffect, useState } from "react"
import { useSession, signOut } from "next-auth/react"
import { User, Lock, LogOut, Save, Eye, EyeOff, Bell, BellOff, BellRing, KeyRound, Plus, Copy, Check, Trash2, Loader2 } from "lucide-react"
import toast from "react-hot-toast"
import {
  disablePush,
  enablePush,
  getCurrentPushSubscription,
  isPushSupported,
} from "@/lib/push-client"

type PushStatus = "loading" | "unsupported" | "off" | "on"

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
        Receba um aviso neste aparelho quando um vídeo passar de 100 mil visualizações, e um
        resumo das visualizações de hoje, somando todas as contas, às 08h, 12h, 14h, 18h e 22h.
        No iPhone, funciona depois de adicionar o InstaFlow à Tela de Início pelo Safari.
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

        <NotificationsCard />

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
