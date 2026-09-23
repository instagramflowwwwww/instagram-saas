"use client"

import { useEffect, useState } from "react"
import {
  AlertTriangle,
  Bot,
  Eye,
  EyeOff,
  FileSearch,
  Loader2,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import toast from "react-hot-toast"
import { confirmToast } from "@/lib/toast"

type UnofficialAccount = {
  id: string
  username: string
  status: string
  lastError: string | null
  lastAttemptAt: string | null
  proxyUrl: string | null
  createdAt: string
}

type Diagnostic = {
  username: string
  lastError: string | null
  diagnostic: {
    url: string
    title: string
    text: string
    screenshot: string | null
    capturedAt: string
  }
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Aguardando",
  logging_in: "Fazendo login...",
  logged_in: "Logada",
  checkpoint_required: "Checkpoint — precisa de ação manual",
  invite_accepted: "Convite aceito",
  failed: "Falhou",
}

const STATUS_CLASSES: Record<string, string> = {
  pending: "border-gray-500/20 bg-gray-500/10 text-gray-300",
  logging_in: "border-blue-500/20 bg-blue-500/10 text-blue-300",
  logged_in: "border-purple-500/20 bg-purple-500/10 text-purple-300",
  checkpoint_required: "border-orange-500/20 bg-orange-500/10 text-orange-300",
  invite_accepted: "border-green-500/20 bg-green-500/10 text-green-300",
  failed: "border-red-500/20 bg-red-500/10 text-red-300",
}

function formatDate(value: string | null) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
}

export default function UnofficialApiPage() {
  const [accounts, setAccounts] = useState<UnofficialAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [totpSecret, setTotpSecret] = useState("")
  const [proxyUrl, setProxyUrl] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null)
  const [loadingDiagnosticId, setLoadingDiagnosticId] = useState<string | null>(null)

  const load = async () => {
    try {
      const res = await fetch("/api/unofficial/accounts", { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Não foi possível carregar as contas.")
      setAccounts(Array.isArray(data.accounts) ? data.accounts : [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar as contas.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const addAccount = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      const res = await fetch("/api/unofficial/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, totpSecret, proxyUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Não foi possível adicionar a conta.")
      toast.success("Conta adicionada.")
      setUsername("")
      setPassword("")
      setTotpSecret("")
      setProxyUrl("")
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível adicionar a conta.")
    } finally {
      setSaving(false)
    }
  }

  const removeAccount = async (account: UnofficialAccount) => {
    const confirmed = await confirmToast(`Remover @${account.username}?`, { confirmLabel: "Remover", danger: true })
    if (!confirmed) return
    setDeletingId(account.id)
    try {
      const res = await fetch(`/api/unofficial/accounts/${account.id}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Não foi possível remover a conta.")
      toast.success("Conta removida.")
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover a conta.")
    } finally {
      setDeletingId(null)
    }
  }

  const openDiagnostic = async (account: UnofficialAccount) => {
    setLoadingDiagnosticId(account.id)
    try {
      const res = await fetch(`/api/unofficial/accounts/${account.id}/diagnostic`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Não foi possível carregar o diagnóstico.")
      setDiagnostic(data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar o diagnóstico.")
    } finally {
      setLoadingDiagnosticId(null)
    }
  }

  const processBatch = async () => {
    setProcessing(true)
    try {
      const res = await fetch("/api/unofficial/process", { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Não foi possível processar o lote.")
      toast.success(`${data.processed} conta(s) processada(s).`)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível processar o lote.")
    } finally {
      setProcessing(false)
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
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Bot size={20} className="text-purple-400" />
          <h1 className="text-2xl font-bold text-white">API não oficial</h1>
        </div>
        <p className="text-gray-500 mt-1">
          Login direto com usuário/senha (fora do OAuth oficial) só pra aceitar convites de
          testador em lote. Isolado das contas conectadas pela API oficial em "App Meta".
        </p>
      </div>

      <div className="mb-5 flex gap-3 rounded-xl border border-orange-500/20 bg-orange-500/[0.06] p-4">
        <AlertTriangle size={18} className="text-orange-400 shrink-0 mt-0.5" />
        <p className="text-xs text-orange-200/80 leading-relaxed">
          Isso automatiza login fora da API oficial do Instagram — foge dos Termos de Uso da Meta
          e aumenta o risco de a conta ser sinalizada ou bloqueada, principalmente sem proxy
          dedicado por conta. Use com uma conta de teste primeiro.
        </p>
      </div>

      <div className="bg-[#111] border border-white/5 rounded-2xl p-6 mb-5">
        <h2 className="text-white font-semibold mb-4">Adicionar conta</h2>
        <form onSubmit={addAccount} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/^@/, ""))}
              required
              placeholder="usuario (sem @)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
            />
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Senha"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
              />
              <button type="button" onClick={() => setShowPassword((c) => !c)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={totpSecret}
              onChange={(e) => setTotpSecret(e.target.value)}
              placeholder="Segredo TOTP do 2FA (opcional)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
            />
            <input
              value={proxyUrl}
              onChange={(e) => setProxyUrl(e.target.value)}
              placeholder="Proxy (opcional, ex.: http://usuario:senha@host:porta)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Adicionar conta
          </button>
        </form>
      </div>

      <div className="bg-[#111] border border-white/5 rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-white font-semibold">Contas ({accounts.length})</h2>
          <button
            onClick={processBatch}
            disabled={processing || accounts.length === 0}
            className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            {processing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Aceitar convites em lote de 2
          </button>
        </div>

        {accounts.length === 0 ? (
          <p className="text-gray-500 text-sm py-6 text-center">Nenhuma conta cadastrada ainda.</p>
        ) : (
          <div className="space-y-2">
            {accounts.map((account) => (
              <div key={account.id} className="flex items-center gap-3 bg-white/[0.025] border border-white/5 rounded-xl p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">@{account.username}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Última tentativa: {formatDate(account.lastAttemptAt)}
                    {account.lastError ? ` · ${account.lastError}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] border ${STATUS_CLASSES[account.status] || STATUS_CLASSES.pending}`}>
                  {STATUS_LABELS[account.status] || account.status}
                </span>
                {(account.status === "failed" || account.status === "checkpoint_required" || account.lastError) && (
                  <button
                    onClick={() => openDiagnostic(account)}
                    disabled={loadingDiagnosticId === account.id}
                    title="Ver o que o Instagram mostrou na última falha"
                    className="p-2 text-gray-500 hover:text-purple-400 hover:bg-purple-500/10 rounded-lg disabled:opacity-50"
                  >
                    {loadingDiagnosticId === account.id ? <Loader2 size={15} className="animate-spin" /> : <FileSearch size={15} />}
                  </button>
                )}
                <button
                  onClick={() => removeAccount(account)}
                  disabled={deletingId === account.id}
                  className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg disabled:opacity-50"
                >
                  {deletingId === account.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {diagnostic && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setDiagnostic(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#111] p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-white font-semibold">Diagnóstico de @{diagnostic.username}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Capturado em {formatDate(diagnostic.diagnostic.capturedAt)}
                </p>
              </div>
              <button onClick={() => setDiagnostic(null)} className="text-gray-500 hover:text-white shrink-0" aria-label="Fechar">
                <X size={16} />
              </button>
            </div>

            {diagnostic.lastError && (
              <p className="text-xs text-red-300/90 mb-3">{diagnostic.lastError}</p>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <p className="text-gray-500 mb-1">URL</p>
                <p className="text-gray-300 font-mono break-all">{diagnostic.diagnostic.url}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">Título da página</p>
                <p className="text-gray-300">{diagnostic.diagnostic.title || "—"}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">Texto visível</p>
                <pre className="whitespace-pre-wrap rounded-lg bg-white/[0.03] border border-white/5 p-3 text-gray-300 max-h-48 overflow-y-auto">
                  {diagnostic.diagnostic.text || "(vazio)"}
                </pre>
              </div>
              {diagnostic.diagnostic.screenshot && (
                <div>
                  <p className="text-gray-500 mb-1">Print da tela</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:image/jpeg;base64,${diagnostic.diagnostic.screenshot}`}
                    alt="Screenshot da página no momento da falha"
                    className="w-full rounded-lg border border-white/10"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
