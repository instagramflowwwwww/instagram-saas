"use client"

export const dynamic = "force-dynamic"

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
  CheckSquare,
  Square,
  Check,
  FolderPlus,
} from "lucide-react"
import toast from "react-hot-toast"
import { confirmToast, toastWarning } from "@/lib/toast"

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
  autoDeleteAt: string | null
  appId: string | null
  syncError: string | null
}

type AccountGroup = {
  id: string
  name: string
  color: string | null
  members: { instagramAccountId: string }[]
}

type FilterType = "all" | "connected" | "error"

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

function AccountAvatar({ src, username }: { src: string | null; username: string }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => { setFailed(false) }, [src])

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
  const [filter, setFilter] = useState<FilterType>("all")
  const [selected, setSelected] = useState<string[]>([])
  const [deletingBulk, setDeletingBulk] = useState(false)
  const [groups, setGroups] = useState<AccountGroup[]>([])
  const [folderMenuFor, setFolderMenuFor] = useState<string | null>(null)
  const [savingFolder, setSavingFolder] = useState<string | null>(null)

  const fetchAccounts = async (manual = false) => {
    if (manual) setRefreshing(true)
    else setLoading(true)

    try {
      const endpoint = manual ? "/api/instagram/accounts?sync=1" : "/api/instagram/accounts"
      const response = await fetch(endpoint, { cache: "no-store" })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || "Erro ao carregar as contas.")

      setAccounts(Array.isArray(data) ? data : [])
      setSelected([])

      if (manual) toast.success("Dados das contas atualizados pela API oficial.")
    } catch (loadError) {
      toast.error(
        loadError instanceof Error ? loadError.message : "Erro ao carregar as contas.",
        { id: "accounts-load-error" }
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { fetchAccounts() }, [])

  const fetchGroups = async () => {
    try {
      const response = await fetch("/api/account-groups", { cache: "no-store" })
      const data = await response.json()
      setGroups(Array.isArray(data) ? data : [])
    } catch {
      // a lista de pastas é secundária aqui: falhar não pode derrubar a tela de contas
    }
  }

  useEffect(() => { fetchGroups() }, [])

  const groupsOfAccount = (accountId: string) =>
    groups.filter((group) =>
      group.members.some((member) => member.instagramAccountId === accountId)
    )

  const toggleFolder = async (accountId: string, group: AccountGroup, isIn: boolean) => {
    setSavingFolder(`${accountId}:${group.id}`)
    try {
      const response = await fetch("/api/account-groups/members", {
        method: isIn ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: group.id, accountIds: [accountId] }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar a pasta.")

      toast.success(isIn ? `Removida de "${group.name}".` : `Adicionada a "${group.name}".`)
      await fetchGroups()
    } catch (folderError) {
      toast.error(
        folderError instanceof Error ? folderError.message : "Não foi possível salvar a pasta."
      )
    } finally {
      setSavingFolder(null)
    }
  }

  const isError = (account: InstagramAccount) =>
    account.connectionType !== "official" ||
    !account.isActive ||
    account.requiresReconnect

  const isConnected = (account: InstagramAccount) =>
    account.connectionType === "official" &&
    account.isActive &&
    !account.requiresReconnect

  const filteredAccounts = accounts.filter((account) => {
    if (filter === "connected") return isConnected(account)
    if (filter === "error") return isError(account)
    return true
  })

  const errorAccounts = accounts.filter(isError)

  const officialCount = accounts.filter((a) => a.connectionType === "official").length
  const connectedCount = accounts.filter(isConnected).length
  const reconnectCount = officialCount - connectedCount
  const legacyCount = accounts.length - officialCount

  useEffect(() => {
    if (loading || legacyCount <= 0) return
    toastWarning(
      `${legacyCount} conta(s) ainda usam a conexão privada antiga. Remova essas contas e conecte novamente pelo App Meta para publicar pela API oficial.`,
      "legacy-instagram-accounts"
    )
  }, [legacyCount, loading])

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
      if (!response.ok) throw new Error(data.error || "Não foi possível remover a conta.")
      toast.success("Conta removida com sucesso.")
      await fetchAccounts()
    } catch (removeError) {
      toast.error(removeError instanceof Error ? removeError.message : "Não foi possível remover a conta.")
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((s) => s !== id) : [...current, id]
    )
  }

  const selectAllErrors = () => {
    const errorIds = errorAccounts.map((a) => a.id)
    setSelected(errorIds)
    setFilter("error")
  }

  const clearSelection = () => setSelected([])

  const removeSelected = async () => {
    if (selected.length === 0) return

    const confirmed = await confirmToast(
      `Remover ${selected.length} conta(s) com erro?`,
      { confirmLabel: "Remover todas", danger: true }
    )
    if (!confirmed) return

    setDeletingBulk(true)
    let removed = 0
    let failed = 0

    for (const id of selected) {
      try {
        const response = await fetch("/api/instagram/accounts", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        })
        if (response.ok) removed++
        else failed++
      } catch {
        failed++
      }
    }

    setDeletingBulk(false)
    setSelected([])

    if (removed > 0) toast.success(`${removed} conta(s) removida(s).`)
    if (failed > 0) toast.error(`${failed} conta(s) não puderam ser removidas.`)

    await fetchAccounts()
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Contas do Instagram</h1>
{/* v2 */}
          <p className="text-gray-500 mt-1">
            {connectedCount} conectada(s) pela API oficial
            {reconnectCount > 0 ? ` · ${reconnectCount} aguardando reconexão` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchAccounts(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center justify-center gap-2 border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] disabled:opacity-50 text-gray-300 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
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

      {/* Filtros */}
      {!loading && accounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {(["all", "connected", "error"] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setSelected([]) }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm transition-colors ${
                filter === f
                  ? f === "error"
                    ? "bg-red-500/20 border border-red-500/30 text-red-300"
                    : "bg-purple-500/20 border border-purple-500/30 text-purple-300"
                  : "bg-white/5 border border-white/10 text-gray-400 hover:text-white"
              }`}
            >
              {f === "all" && `Todas (${accounts.length})`}
              {f === "connected" && `Conectadas (${connectedCount})`}
              {f === "error" && (
                <>
                  <XCircle size={13} />
                  Com erro ({errorAccounts.length})
                </>
              )}
            </button>
          ))}

          {errorAccounts.length > 0 && (
            <button
              onClick={selectAllErrors}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 transition-colors ml-auto"
            >
              <CheckSquare size={13} />
              Selecionar todas com erro
            </button>
          )}
        </div>
      )}

      {/* Barra de ação em massa */}
      {selected.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-5">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="text-red-400" />
            <span className="text-sm text-red-300 font-medium">
              {selected.length} conta(s) selecionada(s)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearSelection}
              className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5"
            >
              Cancelar
            </button>
            <button
              onClick={removeSelected}
              disabled={deletingBulk}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 px-4 py-1.5 rounded-lg transition-colors"
            >
              {deletingBulk ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              {deletingBulk ? "Removendo..." : "Remover selecionadas"}
            </button>
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
      ) : filteredAccounts.length === 0 ? (
        <div className="bg-[#111] border border-white/5 rounded-2xl py-16 text-center">
          <CheckCircle size={24} className="text-green-400 mx-auto mb-3" />
          <p className="text-white font-semibold mb-1">Nenhuma conta com erro!</p>
          <p className="text-gray-500 text-sm">Todas as contas estão conectadas corretamente.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredAccounts.map((account) => {
            const connected = isConnected(account)
            const hasError = isError(account)
            const isSelected = selected.includes(account.id)
            const accountGroups = groupsOfAccount(account.id)
            const folderMenuOpen = folderMenuFor === account.id

            return (
              <div
                key={account.id}
                onClick={() => hasError && toggleSelect(account.id)}
                className={`bg-[#111] border rounded-2xl p-5 transition-colors ${
                  isSelected
                    ? "border-red-500/40 bg-red-500/5"
                    : hasError
                    ? "border-red-500/20 hover:border-red-500/30 cursor-pointer"
                    : "border-white/[0.07] hover:border-white/10"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-5">
                  <div className="flex items-center gap-3 min-w-0">
                    {hasError && (
                      <div className="shrink-0">
                        {isSelected
                          ? <CheckSquare size={16} className="text-red-400" />
                          : <Square size={16} className="text-gray-600" />}
                      </div>
                    )}
                    <AccountAvatar src={account.profilePicture} username={account.username} />
                    <div className="min-w-0">
                      <p className="font-semibold text-white text-sm truncate">@{account.username}</p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {account.name || getAccountTypeLabel(account.accountType)}
                      </p>
                      <p className="text-[10px] text-purple-400/80 mt-1 uppercase tracking-wide">
                        {getAccountTypeLabel(account.accountType)}
                      </p>
                    </div>
                  </div>
                  <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 shadow-[0_0_10px_currentColor] ${
                    connected ? "bg-green-400 text-green-400" : "bg-red-400 text-red-400"
                  }`} />
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="bg-white/[0.025] border border-white/[0.06] rounded-xl p-3.5">
                    <p className="text-[10px] text-gray-600 uppercase tracking-wide">Seguidores</p>
                    <p className="text-lg text-white font-semibold mt-1">{formatNumber(account.followerCount)}</p>
                  </div>
                  <div className="bg-white/[0.025] border border-white/[0.06] rounded-xl p-3.5">
                    <p className="text-[10px] text-gray-600 uppercase tracking-wide">Publicações</p>
                    <p className="text-lg text-white font-semibold mt-1">{formatNumber(account.mediaCount)}</p>
                  </div>
                </div>

                {account.syncError && (
                  <div className="flex items-start gap-2 border border-yellow-500/15 bg-yellow-500/[0.06] rounded-lg px-3 py-2.5 mb-4">
                    <AlertCircle size={13} className="text-yellow-400 mt-0.5 shrink-0" />
                    <p className="text-[11px] leading-4 text-yellow-200/70">{account.syncError}</p>
                  </div>
                )}

                <div className="space-y-2 text-xs mb-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-600">Conexão</span>
                    <span className={account.connectionType === "official" ? "text-purple-400" : "text-yellow-400"}>
                      {account.connectionType === "official" ? "API oficial" : "Privada antiga"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-600">{connected ? "Última atualização" : "Desconectada em"}</span>
                    <span className="text-gray-400">{formatDate(account.lastActiveAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-600">Token expira</span>
                    <span className="text-gray-400">{formatDate(account.tokenExpiresAt)}</span>
                  </div>
                  {!connected && account.autoDeleteAt && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-red-400/70">Remoção automática</span>
                      <span className="text-red-300/80">{formatDate(account.autoDeleteAt)}</span>
                    </div>
                  )}
                </div>

                <div className="mb-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[10px] text-gray-600 uppercase tracking-wide">Pastas</span>
                    <button
                      onClick={() => setFolderMenuFor(folderMenuOpen ? null : account.id)}
                      className="inline-flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300"
                    >
                      <FolderPlus size={12} />
                      {folderMenuOpen ? "Fechar" : "Escolher"}
                    </button>
                  </div>

                  {accountGroups.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {accountGroups.map((group) => (
                        <span
                          key={group.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.04] border border-white/[0.07] px-2 py-1 text-[11px] text-gray-300"
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: group.color || "#7C3AED" }}
                          />
                          {group.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-600">Ainda não está em nenhuma pasta.</p>
                  )}

                  {folderMenuOpen && (
                    <div className="mt-2 rounded-xl border border-purple-500/20 bg-purple-500/[0.05] p-2">
                      {groups.length === 0 ? (
                        <Link
                          href="/dashboard/groups"
                          className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-purple-400 hover:text-purple-300"
                        >
                          <FolderPlus size={12} />
                          Criar a primeira pasta
                        </Link>
                      ) : (
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {groups.map((group) => {
                            const isIn = group.members.some(
                              (member) => member.instagramAccountId === account.id
                            )
                            const busy = savingFolder === `${account.id}:${group.id}`

                            return (
                              <button
                                key={group.id}
                                onClick={() => toggleFolder(account.id, group, isIn)}
                                disabled={busy}
                                className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors disabled:opacity-50 ${
                                  isIn
                                    ? "bg-purple-500/15 text-purple-200"
                                    : "text-gray-400 hover:bg-white/5 hover:text-white"
                                }`}
                              >
                                <span
                                  className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                                  style={{ backgroundColor: `${group.color || "#7C3AED"}22` }}
                                >
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: group.color || "#7C3AED" }}
                                  />
                                </span>
                                <span className="truncate flex-1">{group.name}</span>
                                {busy ? (
                                  <Loader2 size={11} className="animate-spin shrink-0" />
                                ) : isIn ? (
                                  <Check size={12} className="text-purple-300 shrink-0" />
                                ) : null}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
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
