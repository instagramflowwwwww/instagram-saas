"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Check,
  Clock3,
  FileText,
  Instagram,
  Loader2,
  RefreshCw,
  Shield,
  ShieldOff,
  TimerOff,
  UserCheck,
  UserRoundX,
  Users,
  X,
} from "lucide-react"

type UserStatus = "pending" | "approved" | "rejected" | "expired"
type PlanId = "vip" | "premium"

type AdminUser = {
  id: string
  name: string | null
  email: string | null
  createdAt: string
  accessStatus: string
  effectiveStatus: UserStatus
  planName: string | null
  planDurationDays: number | null
  accessStartsAt: string | null
  accessExpiresAt: string | null
  approvedAt: string | null
  rejectedAt: string | null
  isAdmin: boolean
  accountsCount: number
  postsCount: number
  publishedCount: number
}

type AdminData = {
  totalUsers: number
  totalAccounts: number
  totalPosts: number
  pendingUsers: number
  activeUsers: number
  expiredUsers: number
  rejectedUsers: number
  users: AdminUser[]
}

const PLAN_OPTIONS: Array<{ id: PlanId; label: string }> = [
  { id: "vip", label: "VIP — 15 dias" },
  { id: "premium", label: "Premium — 30 dias" },
]

const STATUS_LABELS: Record<UserStatus, string> = {
  pending: "Pendente",
  approved: "Ativo",
  rejected: "Recusado",
  expired: "Expirado",
}

const STATUS_CLASSES: Record<UserStatus, string> = {
  pending: "border-yellow-500/20 bg-yellow-500/10 text-yellow-300",
  approved: "border-green-500/20 bg-green-500/10 text-green-300",
  rejected: "border-red-500/20 bg-red-500/10 text-red-300",
  expired: "border-orange-500/20 bg-orange-500/10 text-orange-300",
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value))
}

function planLabel(planName: string | null, days: number | null) {
  if (!planName) return "Sem plano"
  return `${planName === "vip" ? "VIP" : "Premium"}${days ? ` · ${days} dias` : ""}`
}

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [filter, setFilter] = useState<"all" | UserStatus>("all")
  const [plans, setPlans] = useState<Record<string, PlanId>>({})
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setError(null)
    try {
      const response = await fetch("/api/admin/stats", { cache: "no-store" })
      if (response.status === 403) {
        setForbidden(true)
        return
      }
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Erro ao carregar usuários")
      setData(payload)
      setPlans((current) => {
        const next = { ...current }
        payload.users.forEach((user: AdminUser) => {
          if (!next[user.id]) {
            next[user.id] = user.planName === "vip" ? "vip" : "premium"
          }
        })
        return next
      })
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Erro ao carregar usuários"
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const updateAccess = async (
    user: AdminUser,
    action: "approve" | "reject"
  ) => {
    if (
      action === "reject" &&
      !confirm(`Recusar o acesso de ${user.name || user.email || "este usuário"}?`)
    ) {
      return
    }

    setProcessingId(user.id)
    setMessage(null)
    setError(null)

    try {
      const response = await fetch(`/api/admin/users/${user.id}/access`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          plan: action === "approve" ? plans[user.id] || "premium" : undefined,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar")
      setMessage(payload.message || "Usuário atualizado.")
      await loadData()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível atualizar"
      )
    } finally {
      setProcessingId(null)
    }
  }

  const filteredUsers = useMemo(() => {
    if (!data) return []
    const users =
      filter === "all"
        ? data.users
        : data.users.filter((user) => user.effectiveStatus === filter)

    return users.slice().sort((a, b) => {
      if (a.effectiveStatus === "pending" && b.effectiveStatus !== "pending") return -1
      if (a.effectiveStatus !== "pending" && b.effectiveStatus === "pending") return 1
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [data, filter])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-purple-400" />
      </div>
    )
  }

  if (forbidden) {
    return (
      <div className="rounded-xl border border-white/5 bg-[#111] p-16 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
          <ShieldOff size={24} className="text-red-400" />
        </div>
        <h3 className="mb-2 font-semibold text-white">Acesso restrito</h3>
        <p className="mx-auto max-w-sm text-sm text-gray-500">
          Você não tem permissão para acessar o painel administrativo.
        </p>
      </div>
    )
  }

  if (!data) return null

  const cards = [
    { label: "Usuários", value: data.totalUsers, icon: Users, className: "text-purple-400" },
    { label: "Aguardando aprovação", value: data.pendingUsers, icon: Clock3, className: "text-yellow-400" },
    { label: "Contas ativas", value: data.activeUsers, icon: UserCheck, className: "text-green-400" },
    { label: "Planos expirados", value: data.expiredUsers, icon: TimerOff, className: "text-orange-400" },
    { label: "Instagram conectados", value: data.totalAccounts, icon: Instagram, className: "text-pink-400" },
    { label: "Posts criados", value: data.totalPosts, icon: FileText, className: "text-blue-400" },
  ]

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Shield size={21} className="text-purple-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Painel Admin</h1>
            <p className="mt-1 text-sm text-gray-500">
              Aprove cadastros, escolha planos e controle a validade das contas.
            </p>
          </div>
        </div>
        <button
          onClick={() => void loadData()}
          className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-gray-300 hover:border-purple-500/30 hover:text-white"
        >
          <RefreshCw size={15} /> Atualizar
        </button>
      </div>

      {message && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-300">
          <Check size={15} /> {message}
        </div>
      )}
      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <X size={15} /> {error}
        </div>
      )}

      <div className="mb-7 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-white/5 bg-[#111] p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-gray-500">{card.label}</span>
              <card.icon size={14} className={card.className} />
            </div>
            <p className="text-2xl font-bold text-white">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-white/5 bg-[#111]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 p-5">
          <div>
            <h2 className="text-sm font-semibold text-white">Usuários e acessos</h2>
            <p className="mt-1 text-xs text-gray-500">
              Cadastros pendentes aparecem primeiro.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "Todos"],
                ["pending", "Pendentes"],
                ["approved", "Ativos"],
                ["expired", "Expirados"],
                ["rejected", "Recusados"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  filter === value
                    ? "bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/30"
                    : "bg-white/[0.03] text-gray-500 hover:text-gray-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-[11px] text-gray-500">
                <th className="px-5 py-3 font-medium">Usuário</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Plano e validade</th>
                <th className="px-5 py-3 font-medium">Uso</th>
                <th className="px-5 py-3 font-medium">Cadastro</th>
                <th className="px-5 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const processing = processingId === user.id
                const active = user.effectiveStatus === "approved"
                const actionLabel =
                  user.effectiveStatus === "pending"
                    ? "Aprovar"
                    : active
                      ? "Renovar"
                      : "Ativar"

                return (
                  <tr key={user.id} className="border-b border-white/5 last:border-0">
                    <td className="px-5 py-4">
                      <p className="font-medium text-white">{user.name || "Sem nome"}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{user.email || "—"}</p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${STATUS_CLASSES[user.effectiveStatus]}`}>
                          {STATUS_LABELS[user.effectiveStatus]}
                        </span>
                        {user.isAdmin && (
                          <span className="rounded-full border border-purple-500/20 bg-purple-500/10 px-2.5 py-1 text-[11px] text-purple-300">
                            Admin
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-xs font-medium text-gray-300">
                        {user.isAdmin ? "Acesso permanente" : planLabel(user.planName, user.planDurationDays)}
                      </p>
                      <p className="mt-1 text-[11px] text-gray-500">
                        {user.isAdmin
                          ? "Sem expiração"
                          : user.accessExpiresAt
                            ? `Expira em ${formatDate(user.accessExpiresAt, true)}`
                            : "Aguardando definição do plano"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-xs text-gray-400">
                      <p>{user.accountsCount} conta(s) Instagram</p>
                      <p className="mt-1">{user.publishedCount}/{user.postsCount} posts publicados</p>
                    </td>
                    <td className="px-5 py-4 text-xs text-gray-500">
                      {formatDate(user.createdAt, true)}
                    </td>
                    <td className="px-5 py-4">
                      {user.isAdmin ? (
                        <p className="text-right text-xs text-gray-600">Conta protegida</p>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <select
                            value={plans[user.id] || "premium"}
                            onChange={(event) =>
                              setPlans((current) => ({
                                ...current,
                                [user.id]: event.target.value as PlanId,
                              }))
                            }
                            disabled={processing}
                            className="rounded-lg border border-white/10 bg-[#171717] px-3 py-2 text-xs text-gray-300 focus:border-purple-500 focus:outline-none disabled:opacity-50"
                          >
                            {PLAN_OPTIONS.map((plan) => (
                              <option key={plan.id} value={plan.id}>
                                {plan.label}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => void updateAccess(user, "approve")}
                            disabled={processing}
                            className="flex min-w-24 items-center justify-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-50"
                          >
                            {processing ? <Loader2 size={13} className="animate-spin" /> : <UserCheck size={13} />}
                            {actionLabel}
                          </button>
                          <button
                            onClick={() => void updateAccess(user, "reject")}
                            disabled={processing || user.effectiveStatus === "rejected"}
                            className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/15 disabled:opacity-40"
                          >
                            <UserRoundX size={13} />
                            {active ? "Bloquear" : "Recusar"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-sm text-gray-600">
                    Nenhum usuário encontrado neste filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
