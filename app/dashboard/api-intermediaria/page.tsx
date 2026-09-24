"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ExternalLink, Loader2, Plug, RefreshCw, Save, UserPlus, X } from "lucide-react"
import toast from "react-hot-toast"
import { confirmToast } from "@/lib/toast"

const inputClass =
  "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"

export default function ApiIntermediariaPage() {
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(false)
  const [baseUrl, setBaseUrl] = useState("")
  const [token, setToken] = useState("")
  const [connectLink, setConnectLink] = useState("")
  const [savedLink, setSavedLink] = useState("")
  const [saving, setSaving] = useState(false)

  const [accounts, setAccounts] = useState<string[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)

  const loadAccounts = async () => {
    setLoadingAccounts(true)
    try {
      const res = await fetch("/api/storrito/accounts", { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Não foi possível listar as contas.")
      setAccounts((data.accounts || []).map((item: { username: string }) => item.username))
    } catch (error) {
      setAccounts([])
      toast.error(error instanceof Error ? error.message : "Não foi possível listar as contas.")
    } finally {
      setLoadingAccounts(false)
    }
  }

  const loadConfig = async () => {
    try {
      const res = await fetch("/api/storrito/config", { cache: "no-store" })
      const data = await res.json()
      setConfigured(Boolean(data.configured))
      setBaseUrl(data.baseUrl || "")
      setConnectLink(data.connectLink || "")
      setSavedLink(data.connectLink || "")
      if (data.configured) await loadAccounts()
    } catch {
      toast.error("Não foi possível carregar a conexão.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadConfig() }, [])

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      const res = await fetch("/api/storrito/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, token, connectLink }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.")
      setToken("")
      toast.success(configured ? "Conexão atualizada." : "Conexão salva.")
      setLoading(true)
      await loadConfig()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.")
    } finally {
      setSaving(false)
    }
  }

  const disconnect = async () => {
    const ok = await confirmToast("Desconectar a API intermediária do InstaFlow?", { confirmLabel: "Desconectar", danger: true })
    if (!ok) return
    await fetch("/api/storrito/config", { method: "DELETE" })
    setConfigured(false)
    setAccounts([])
    setToken("")
    setConnectLink("")
    setSavedLink("")
    toast.success("Desconectado.")
  }

  const openConnectLink = () => {
    if (!savedLink) return
    window.open(savedLink, "_blank", "noopener,noreferrer")
  }

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
          <Plug size={20} className="text-purple-400" />
          <h1 className="text-2xl font-bold text-white">Conexão na API intermediária</h1>
        </div>
        <p className="text-gray-500 mt-1">
          Liga o InstaFlow ao Storrito, o serviço de terceiros que posta story com adesivo de link.
          Separado da conexão oficial em "App Meta".
        </p>
      </div>

      <div className="mb-5 flex gap-3 rounded-xl border border-orange-500/20 bg-orange-500/[0.06] p-4">
        <AlertTriangle size={18} className="text-orange-400 shrink-0 mt-0.5" />
        <p className="text-xs text-orange-200/80 leading-relaxed">
          O Storrito posta automatizando o app do Instagram, e não pela API oficial. Isso foge dos
          Termos de Uso da Meta e pode gerar restrição na conta. A senha do Instagram fica só com o
          Storrito, e o InstaFlow nunca a vê.
        </p>
      </div>

      <div className="bg-[#111] border border-white/5 rounded-2xl p-6 mb-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-white font-semibold">Credenciais do Storrito</h2>
          {configured && (
            <button onClick={disconnect} className="inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300">
              <X size={13} /> Desconectar
            </button>
          )}
        </div>

        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">URL base da API</label>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required placeholder="https://CODIGO.storrito.com/api/v1" className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Token da API {configured && <span className="text-gray-600">(deixe vazio para manter o atual)</span>}
            </label>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} required={!configured} placeholder={configured ? "Token já salvo" : "Token da API"} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Link de conexão <span className="text-gray-600">(opcional — permite conectar uma conta do Instagram no Storrito com um clique)</span>
            </label>
            <input value={connectLink} onChange={(e) => setConnectLink(e.target.value)} placeholder="https://CODIGO.storrito.com/ui/connect3?connect-link=..." className={inputClass} />
          </div>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {configured ? "Salvar alterações" : "Conectar"}
          </button>
        </form>
      </div>

      {configured && (
        <div className="bg-[#111] border border-white/5 rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-white font-semibold">Contas no Storrito ({accounts.length})</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={openConnectLink}
                disabled={!savedLink}
                title={savedLink ? "Abre o Storrito em outra aba para conectar o Instagram" : "Cadastre o link de conexão acima"}
                className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 text-white text-sm font-medium px-3.5 py-2 rounded-lg"
              >
                <UserPlus size={14} /> Conectar conta no Storrito <ExternalLink size={12} className="text-gray-500" />
              </button>
              <button
                onClick={loadAccounts}
                disabled={loadingAccounts}
                className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 text-white text-sm font-medium px-3.5 py-2 rounded-lg"
              >
                {loadingAccounts ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Atualizar contas
              </button>
            </div>
          </div>

          {accounts.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              Nenhuma conta conectada no Storrito ainda. Conecte uma e clique em "Atualizar contas".
            </p>
          ) : (
            <div className="space-y-2">
              {accounts.map((name) => (
                <div key={name} className="bg-white/[0.025] border border-white/5 rounded-xl px-4 py-3 text-sm text-white">
                  @{name}
                </div>
              ))}
            </div>
          )}

          <Link href="/dashboard/story-link" className="inline-block mt-4 text-xs text-purple-400 hover:text-purple-300">
            Ir para Story com link →
          </Link>
        </div>
      )}
    </div>
  )
}
