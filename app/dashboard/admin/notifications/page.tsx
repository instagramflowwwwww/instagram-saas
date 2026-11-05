"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Bell, Loader2, Send, ShieldOff, Users } from "lucide-react"
import toast from "react-hot-toast"

type AdminNotification = {
  id: string
  title: string
  message: string
  createdAt: string
  readCount: number
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export default function AdminNotificationsPage() {
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [history, setHistory] = useState<AdminNotification[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/notifications", { cache: "no-store" })
      if (response.status === 403) {
        setForbidden(true)
        return
      }
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || "Erro ao carregar avisos")
      setHistory(payload.notifications)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar avisos")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const sendNotification = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error("Preencha o título e a mensagem.")
      return
    }

    setSending(true)
    try {
      const response = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, message }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || "Não foi possível enviar.")

      setHistory((current) => [payload.notification, ...(current || [])])
      setTitle("")
      setMessage("")
      toast.success(payload.message || "Aviso enviado.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar.")
    } finally {
      setSending(false)
    }
  }

  if (forbidden) {
    return (
      <div className="rounded-xl border border-white/5 bg-[#0d0d10] p-16 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
          <ShieldOff size={24} className="text-red-400" />
        </div>
        <h3 className="mb-2 font-semibold text-white">Acesso restrito</h3>
        <p className="mx-auto max-w-sm text-sm text-gray-500">
          Você não tem permissão para acessar esta página.
        </p>
      </div>
    )
  }

  return (
    <div
      className="relative -m-4 min-w-0 overflow-x-hidden p-4 md:-m-8 md:p-8"
      style={{
        background:
          "radial-gradient(900px 480px at 12% -10%, rgba(192,132,252,0.16), transparent 60%), radial-gradient(800px 420px at 92% 0%, rgba(236,72,153,0.12), transparent 55%), #08080a",
      }}
    >
      <div className="mb-8">
        <Link
          href="/dashboard/admin"
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-purple-400 hover:text-purple-300"
        >
          <ArrowLeft size={13} />
          Painel Admin
        </Link>
        <div className="flex items-center gap-3">
          <Bell size={21} className="text-purple-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Notificações</h1>
            <p className="mt-1 text-sm text-gray-500">
              Envie um aviso que aparece pra todo mundo no sininho do dashboard.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-xl space-y-4">
        <div className="rounded-xl border border-white/5 bg-[#0d0d10] p-6">
          <div className="mb-5 flex items-center gap-2">
            <Send size={16} className="text-purple-400" />
            <h2 className="text-sm font-semibold text-white">Novo aviso</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs text-gray-400">Título</label>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex: Manutenção programada"
                maxLength={120}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-gray-400">Mensagem</label>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Ex: O InstaFlow vai ficar fora do ar das 2h às 3h pra manutenção."
                maxLength={2000}
                rows={4}
                className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none"
              />
            </div>
            <button
              onClick={() => void sendNotification()}
              disabled={sending}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {sending ? "Enviando..." : "Enviar pra todo mundo"}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-white/5 bg-[#0d0d10] p-6">
          <div className="mb-5 flex items-center gap-2">
            <Users size={16} className="text-purple-400" />
            <h2 className="text-sm font-semibold text-white">Avisos enviados</h2>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 size={20} className="animate-spin text-purple-400" />
            </div>
          ) : !history || history.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-600">Nenhum aviso enviado ainda.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {history.map((notification) => (
                <div key={notification.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-white">{notification.title}</p>
                    <span className="shrink-0 text-[10px] text-gray-600">
                      {formatDate(notification.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{notification.message}</p>
                  <p className="mt-1.5 text-[10px] text-gray-600">
                    {notification.readCount} pessoa(s) visualizaram
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
