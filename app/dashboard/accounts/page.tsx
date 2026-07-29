"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  AlertCircle,
  Boxes,
  CheckCircle,
  Instagram,
  Loader2,
  RefreshCw,
  Trash2,
  UserPlus,
  XCircle,
} from "lucide-react"

type InstagramAccount = {
  id: string
  username: string
  name: string | null
  accountType: string | null
  profilePicture: string | null
  followerCount: number | null
  mediaCount: number | null
  connectionType: string
  isActive: boolean
  requiresReconnect: boolean
  tokenExpiresAt: string | null
  lastActiveAt: string
  appId: string | null
  syncError: string | null
}

function formatNumber(value: number | null) {
  return value === null ? "—" : value.toLocaleString("pt-BR")
}

function formatDate(value: string | null) {
  if (!value) return "—"

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

function getAccountTypeLabel(value: string | null) {
  if (value === "BUSINESS") return "Conta comercial"
  if (value === "MEDIA_CREATOR") return "Criador de conteúdo"
  return "Conta profissional"
}

function AccountAvatar({
  src,
  username,
}: {
  src: string | null
  username: string
}) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (!src || failed) {
    return (
      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0 ring-2 ring-white/5">
        <Instagram size={21} className="text-white" />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={`Foto de perfil de @${username}`}
      className="w-14 h-14 rounded-full object-cover shrink-0 ring-2 ring-purple-500/25"
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
    />
  )
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<InstagramAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const fetchAccounts = async (manual = false) => {
    if (manual) {
      setRefreshing(true)
      setMessage(null)
    } else {
      setLoading(true)
    }

    setError(null)

    try {
      const response = await fetch("/api/instagram/accounts", {
        cache: "no-store",
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Erro ao carregar as contas.")
      }

      setAccounts(Array.isArray(data) ? data : [])

      if (manual) {
        setMessage("Dados das contas atualizados pela API oficial.")
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Erro ao carregar as contas."
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchAccounts()
  }, [])

  const removeAccount = async (id: string) => {
    if (!confirm("Remover esta conta conectada?")) return

    setError(null)
    setMessage(null)

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

    setMessage("Conta removida com sucesso.")
    await fetchAccounts()
  }

  const officialCount = accounts.filter(
    (account) => account.connectionType === "official"
  ).length
  const legacyCount = accounts.length - officialCount

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Contas do Instagram</h1>
          <p className="text-gray-500 mt-1">
            {officialCount} conta(s) conectada(s) pela API oficial
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchAccounts(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center justify-center gap-2 border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] disabled:opacity-50 text-gray-300 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            <RefreshCw
              size={15}
              className={refreshing ? "animate-spin" : ""}
            />
            Atualizar dados
          </button>
          <Link
            href="/dashboard/meta-app"
            className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-opacity"
          >
            <UserPlus size={15} />
            Conectar pelo App Meta
          </Link>
        </div>
      </div>

      {message && (
        <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-6">
          <CheckCircle size={16} className="text-green-400" />
          <p className="text-green-300 text-sm font-medium">{message}</p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <XCircle size={16} className="text-red-400" />
          <p className="text-red-300 text-sm font-medium">{error}</p>
        </div>
      )}

      {legacyCount > 0 && (
        <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-6">
          <AlertCircle size={17} className="text-yellow-400 mt-0.5" />
          <div>
            <p className="text-yellow-300 text-sm font-medium">
              {legacyCount} conta(s) ainda usam a conexão privada antiga.
            </p>
            <p className="text-yellow-200/60 text-xs mt-1">
              Remova essas contas e conecte novamente pelo App Meta para publicar pela API oficial.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-purple-400" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="bg-[#111] border border-dashed border-white/10 rounded-2xl py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
            <Instagram size={24} className="text-purple-400" />
          </div>
          <h2 className="text-white font-semibold mb-2">Nenhuma conta conectada</h2>
          <p className="text-gray-500 text-sm max-w-md mx-auto mb-6">
            Configure seu próprio App Meta, adicione a conta como Instagram Tester e autorize pelo login oficial.
          </p>
          <Link
            href="/dashboard/meta-app"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium px-6 py-3 rounded-xl hover:opacity-90"
          >
            <Boxes size={15} />
            Configurar App Meta
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accounts.map((account) => {
            const connected =
              account.connectionType === "official" &&
              account.isActive &&
              !account.requiresReconnect

            return (
              <div
                key={account.id}
                className="bg-[#111] border border-white/[0.07] rounded-2xl p-5 transition-colors hover:border-white/10"
              >
                <div className="flex items-start justify-between gap-3 mb-5">
                  <div className="flex items-center gap-3 min-w-0">
                    <AccountAvatar
                      src={account.profilePicture}
                      username={account.username}
                    />
                    <div className="min-w-0">
                      <p className="font-semibold text-white text-sm truncate">
                        @{account.username}
                      </p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {account.name || getAccountTypeLabel(account.accountType)}
                      </p>
                      <p className="text-[10px] text-purple-400/80 mt-1 uppercase tracking-wide">
                        {getAccountTypeLabel(account.accountType)}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 shadow-[0_0_10px_currentColor] ${
                      connected ? "bg-green-400 text-green-400" : "bg-red-400 text-red-400"
                    }`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="bg-white/[0.025] border border-white/[0.06] rounded-xl p-3.5">
                    <p className="text-[10px] text-gray-600 uppercase tracking-wide">
                      Seguidores
                    </p>
                    <p className="text-lg text-white font-semibold mt-1">
                      {formatNumber(account.followerCount)}
                    </p>
                  </div>
                  <div className="bg-white/[0.025] border border-white/[0.06] rounded-xl p-3.5">
                    <p className="text-[10px] text-gray-600 uppercase tracking-wide">
                      Publicações
                    </p>
                    <p className="text-lg text-white font-semibold mt-1">
                      {formatNumber(account.mediaCount)}
                    </p>
                  </div>
                </div>

                {account.syncError && (
                  <div className="flex items-start gap-2 border border-yellow-500/15 bg-yellow-500/[0.06] rounded-lg px-3 py-2.5 mb-4">
                    <AlertCircle size={13} className="text-yellow-400 mt-0.5 shrink-0" />
                    <p className="text-[11px] leading-4 text-yellow-200/70">
                      {account.syncError}
                    </p>
                  </div>
                )}

                <div className="space-y-2 text-xs mb-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-600">Conexão</span>
                    <span
                      className={
                        account.connectionType === "official"
                          ? "text-purple-400"
                          : "text-yellow-400"
                      }
                    >
                      {account.connectionType === "official"
                        ? "API oficial"
                        : "Privada antiga"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-600">Última atualização</span>
                    <span className="text-gray-400">
                      {formatDate(account.lastActiveAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-600">Token expira</span>
                    <span className="text-gray-400">
                      {formatDate(account.tokenExpiresAt)}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  {connected ? (
                    <span className="flex-1 inline-flex items-center justify-center gap-1.5 bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium py-2.5 rounded-lg">
                      <CheckCircle size={13} />
                      Conectada
                    </span>
                  ) : (
                    <Link
                      href="/dashboard/meta-app"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-medium py-2.5 rounded-lg hover:bg-purple-500/15"
                    >
                      <RefreshCw size={13} />
                      Reconectar
                    </Link>
                  )}
                  <button
                    onClick={() => removeAccount(account.id)}
                    className="inline-flex items-center justify-center px-3 bg-red-500/5 border border-red-500/10 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded-lg"
                    aria-label="Remover conta"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
