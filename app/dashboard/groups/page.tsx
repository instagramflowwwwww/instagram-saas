"use client"

import { useEffect, useState } from "react"
import {
  Folder,
  FolderPlus,
  Instagram,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react"
import toast from "react-hot-toast"
import { confirmToast } from "@/lib/toast"

type InstagramAccount = {
  id: string
  username: string
  profilePicture: string | null
  isActive: boolean
  requiresReconnect: boolean
  connectionType: string
}

type GroupMember = {
  groupId: string
  instagramAccountId: string
  instagramAccount: InstagramAccount
}

type AccountGroup = {
  id: string
  name: string
  color: string | null
  createdAt: string
  members: GroupMember[]
}

const COLORS = [
  { label: "Roxo", value: "#7C3AED" },
  { label: "Rosa", value: "#DB2777" },
  { label: "Azul", value: "#2563EB" },
  { label: "Verde", value: "#16A34A" },
  { label: "Laranja", value: "#EA580C" },
  { label: "Vermelho", value: "#DC2626" },
  { label: "Amarelo", value: "#CA8A04" },
  { label: "Ciano", value: "#0891B2" },
]

export default function GroupsPage() {
  const [groups, setGroups] = useState<AccountGroup[]>([])
  const [accounts, setAccounts] = useState<InstagramAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState(COLORS[0].value)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editColor, setEditColor] = useState("")
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null)
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([])

  const fetchData = async () => {
    try {
      const [groupsRes, accountsRes] = await Promise.all([
        fetch("/api/account-groups", { cache: "no-store" }),
        fetch("/api/instagram/accounts", { cache: "no-store" }),
      ])
      const groupsData = await groupsRes.json()
      const accountsData = await accountsRes.json()
      setGroups(Array.isArray(groupsData) ? groupsData : [])
      setAccounts(
        (Array.isArray(accountsData) ? accountsData : []).filter(
          (a: InstagramAccount) => a.connectionType === "official" && a.isActive && !a.requiresReconnect
        )
      )
    } catch {
      toast.error("Erro ao carregar dados")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const createGroup = async () => {
    if (!newName.trim()) return toast.error("Informe um nome para a pasta.")
    setSaving(true)
    try {
      const res = await fetch("/api/account-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success("Pasta criada!")
      setNewName("")
      setNewColor(COLORS[0].value)
      setShowNewForm(false)
      await fetchData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar pasta")
    } finally {
      setSaving(false)
    }
  }

  const saveEdit = async (groupId: string) => {
    if (!editName.trim()) return toast.error("Informe um nome.")
    setSaving(true)
    try {
      const res = await fetch("/api/account-groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, name: editName.trim(), color: editColor }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success("Pasta atualizada!")
      setEditingId(null)
      await fetchData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar pasta")
    } finally {
      setSaving(false)
    }
  }

  const deleteGroup = async (group: AccountGroup) => {
    const confirmed = await confirmToast(`Excluir pasta "${group.name}"?`, {
      confirmLabel: "Excluir",
      danger: true,
    })
    if (!confirmed) return
    try {
      const res = await fetch("/api/account-groups", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: group.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success("Pasta removida.")
      await fetchData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover pasta")
    }
  }

  const addMembers = async (groupId: string) => {
    if (selectedToAdd.length === 0) return
    try {
      const res = await fetch("/api/account-groups/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, accountIds: selectedToAdd }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`${data.added} conta(s) adicionada(s)!`)
      setAddingToGroup(null)
      setSelectedToAdd([])
      await fetchData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar contas")
    }
  }

  const removeMember = async (groupId: string, accountId: string) => {
    try {
      const res = await fetch("/api/account-groups/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, accountIds: [accountId] }),
      })
      if (!res.ok) throw new Error()
      toast.success("Conta removida da pasta.")
      await fetchData()
    } catch {
      toast.error("Erro ao remover conta da pasta")
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={24} className="animate-spin text-purple-400" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Pastas de contas</h1>
          <p className="text-gray-500 mt-1">Organize suas contas em grupos para publicar mais rápido.</p>
        </div>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-opacity"
        >
          <FolderPlus size={15} />
          Nova pasta
        </button>
      </div>

      {showNewForm && (
        <div className="bg-[#111] border border-white/10 rounded-2xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-white mb-4">Nova pasta</h2>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Nome</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex.: Clientes VIP, Testes..."
                maxLength={50}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Cor</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setNewColor(c.value)}
                    style={{ backgroundColor: c.value }}
                    className={`w-8 h-8 rounded-full transition-transform ${newColor === c.value ? "scale-125 ring-2 ring-white/50" : "hover:scale-110"}`}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={createGroup} disabled={saving} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Criar pasta
              </button>
              <button onClick={() => setShowNewForm(false)} className="px-4 bg-white/5 hover:bg-white/10 text-gray-400 text-sm rounded-lg transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="bg-[#111] border border-dashed border-white/10 rounded-2xl py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center mx-auto mb-5">
            <Folder size={24} className="text-purple-400" />
          </div>
          <h3 className="font-semibold text-white mb-2">Nenhuma pasta criada</h3>
          <p className="text-gray-500 text-sm max-w-xs mx-auto">Crie pastas para organizar suas contas e publicar em grupos específicos.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const memberIds = group.members.map((m) => m.instagramAccountId)
            const availableToAdd = accounts.filter((a) => !memberIds.includes(a.id))
            const isEditing = editingId === group.id
            const isAddingMembers = addingToGroup === group.id

            return (
              <div key={group.id} className="bg-[#111] border border-white/[0.07] rounded-2xl p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  {isEditing ? (
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex gap-1.5 flex-wrap">
                        {COLORS.map((c) => (
                          <button
                            key={c.value}
                            onClick={() => setEditColor(c.value)}
                            style={{ backgroundColor: c.value }}
                            className={`w-6 h-6 rounded-full transition-transform ${editColor === c.value ? "scale-125 ring-2 ring-white/50" : "hover:scale-110"}`}
                          />
                        ))}
                      </div>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={50}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: group.color || "#7C3AED" }} />
                      <h2 className="font-semibold text-white">{group.name}</h2>
                      <span className="text-xs text-gray-500">{group.members.length} conta(s)</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1">
                    {isEditing ? (
                      <>
                        <button onClick={() => saveEdit(group.id)} disabled={saving} className="p-2 text-green-400 hover:bg-green-500/10 rounded-lg disabled:opacity-50">
                          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg">
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { setEditingId(group.id); setEditName(group.name); setEditColor(group.color || COLORS[0].value) }}
                          className="p-2 text-gray-500 hover:text-purple-400 hover:bg-purple-500/10 rounded-lg"
                        >
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => deleteGroup(group)} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg">
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {group.members.length === 0 ? (
                  <div className="border border-dashed border-white/10 rounded-xl py-6 text-center mb-3">
                    <p className="text-gray-500 text-sm">Nenhuma conta nesta pasta ainda.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-3">
                    {group.members.map((member) => (
                      <div key={member.instagramAccountId} className="flex items-center gap-2 bg-white/[0.025] border border-white/5 rounded-lg px-3 py-2">
                        {member.instagramAccount.profilePicture ? (
                          <img src={member.instagramAccount.profilePicture} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
                            <Instagram size={12} className="text-white" />
                          </div>
                        )}
                        <span className="text-xs text-white truncate flex-1">@{member.instagramAccount.username}</span>
                        <button onClick={() => removeMember(group.id, member.instagramAccountId)} className="text-gray-600 hover:text-red-400 shrink-0">
                          <UserMinus size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {isAddingMembers ? (
                  <div className="border border-purple-500/20 bg-purple-500/5 rounded-xl p-4">
                    <p className="text-xs text-gray-400 mb-3">Selecione as contas para adicionar:</p>
                    {availableToAdd.length === 0 ? (
                      <p className="text-xs text-gray-500">Todas as contas já estão nesta pasta.</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                        {availableToAdd.map((account) => {
                          const isSelected = selectedToAdd.includes(account.id)
                          return (
                            <button
                              key={account.id}
                              onClick={() => setSelectedToAdd((c) => isSelected ? c.filter((id) => id !== account.id) : [...c, account.id])}
                              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors border ${isSelected ? "border-purple-500/40 bg-purple-500/15" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
                            >
                              {account.profilePicture ? (
                                <img src={account.profilePicture} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
                                  <Instagram size={10} className="text-white" />
                                </div>
                              )}
                              <span className="text-xs text-white truncate">@{account.username}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => addMembers(group.id)} disabled={selectedToAdd.length === 0} className="flex items-center gap-1.5 text-xs font-medium bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg transition-colors">
                        <Plus size={12} />
                        Adicionar {selectedToAdd.length > 0 ? `(${selectedToAdd.length})` : ""}
                      </button>
                      <button onClick={() => { setAddingToGroup(null); setSelectedToAdd([]) }} className="text-xs text-gray-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddingToGroup(group.id); setSelectedToAdd([]) }}
                    className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 border border-purple-500/20 hover:border-purple-500/40 bg-purple-500/5 hover:bg-purple-500/10 px-4 py-2 rounded-lg transition-colors"
                  >
                    <UserPlus size={13} />
                    Adicionar contas
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
