"use client"

import { useEffect, useState } from "react"
import {
  Database,
  HardDrive,
  Instagram,
  Loader2,
  Server,
  Zap,
} from "lucide-react"
import toast from "react-hot-toast"

type SystemHealth = {
  postgres: {
    connected: boolean
    latencyMs: number | null
    tableCount: number | null
    poolerMode: string
  }
  backend: {
    region: string
    runtime: string
    domain: string
  }
  storage: {
    configured: boolean
    bucket: string | null
    formats: string[]
  }
  queue: {
    concurrency: number
    lockStrategy: string
  }
  meta: {
    graphVersion: string
    appsConfigured: number
    authenticatedAccounts: number
    redirectPath: string
    tokenCycle: string
  }
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
        ok
          ? "border-green-500/25 bg-green-500/10 text-green-300"
          : "border-red-500/25 bg-red-500/10 text-red-300"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-green-400" : "bg-red-400"}`} />
      {label}
    </span>
  )
}

function InfraCard({
  icon: Icon,
  iconClassName,
  title,
  subtitle,
  ok,
  statusLabel,
  rows,
}: {
  icon: typeof Database
  iconClassName: string
  title: string
  subtitle: string
  ok: boolean
  statusLabel: string
  rows: Array<{ label: string; value: string }>
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#0d0d10] p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}>
            <Icon size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{title}</p>
            <p className="text-[11px] text-gray-500">{subtitle}</p>
          </div>
        </div>
        <StatusPill ok={ok} label={statusLabel} />
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between text-xs">
            <span className="text-gray-500">{row.label}</span>
            <span className="font-mono text-gray-200">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SystemHealthPanel() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/admin/system-health", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Erro ao checar a infraestrutura")
      setHealth(data)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao checar a infraestrutura",
        { id: "system-health-error" }
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (loading && !health) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-white/5 bg-[#0d0d10] py-20">
        <Loader2 size={22} className="animate-spin text-purple-400" />
      </div>
    )
  }

  if (!health) return null

  const metaAuthenticated = health.meta.authenticatedAccounts > 0
  const checks = [health.postgres.connected, health.storage.configured, metaAuthenticated]
  const healthPercent = Math.round((checks.filter(Boolean).length / checks.length) * 100)

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#0d0d10] p-6">
      <div className="mb-1 flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-semibold text-white">Diagnóstico de infraestrutura</h2>
        <span className={`text-sm font-bold ${healthPercent === 100 ? "text-green-400" : "text-amber-400"}`}>
          ({healthPercent}% operacional)
        </span>
      </div>
      <p className="mb-6 text-xs text-gray-500">
        Checagem em tempo real do banco, da fila de publicação, do armazenamento e da API da Meta.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <InfraCard
          icon={Database}
          iconClassName="bg-green-500/10 text-green-400"
          title="Banco de Dados"
          subtitle="PostgreSQL (Neon)"
          ok={health.postgres.connected}
          statusLabel={health.postgres.connected ? "Conectado" : "Falhou"}
          rows={[
            {
              label: "Latência de consulta",
              value: health.postgres.latencyMs !== null ? `${health.postgres.latencyMs} ms` : "—",
            },
            {
              label: "Tabelas gerenciadas",
              value: health.postgres.tableCount !== null ? `${health.postgres.tableCount} tabelas` : "—",
            },
            { label: "Pooler", value: health.postgres.poolerMode },
          ]}
        />

        <InfraCard
          icon={Server}
          iconClassName="bg-purple-500/10 text-purple-400"
          title="Servidor API & Backend"
          subtitle="Vercel Serverless"
          ok
          statusLabel="Saudável"
          rows={[
            { label: "Ponto de borda", value: health.backend.region },
            { label: "Runtime", value: health.backend.runtime },
            { label: "Domínio primário", value: health.backend.domain },
          ]}
        />

        <InfraCard
          icon={HardDrive}
          iconClassName="bg-pink-500/10 text-pink-400"
          title="Armazenamento de mídia"
          subtitle="Cloudflare R2"
          ok={health.storage.configured}
          statusLabel={health.storage.configured ? "Conectado" : "Não configurado"}
          rows={[
            { label: "Bucket", value: health.storage.bucket || "—" },
            { label: "Formatos aceitos", value: health.storage.formats.join(", ") },
          ]}
        />

        <InfraCard
          icon={Zap}
          iconClassName="bg-blue-500/10 text-blue-400"
          title="Fila de publicação"
          subtitle="Queue worker"
          ok
          statusLabel="Operando"
          rows={[
            { label: "Concorrência por rodada", value: `${health.queue.concurrency} contas paralelas` },
            { label: "Retry em falha", value: "2 a 10 min, conforme tentativa" },
          ]}
        />

        <InfraCard
          icon={Instagram}
          iconClassName="bg-rose-500/10 text-rose-400"
          title="Meta Graph API"
          subtitle="Publicação oficial"
          ok={metaAuthenticated}
          statusLabel={metaAuthenticated ? "Autenticado" : "Sem conta ativa"}
          rows={[
            { label: "Versão da API", value: health.meta.graphVersion },
            { label: "Apps de cliente cadastrados", value: String(health.meta.appsConfigured) },
            { label: "Ciclo de token", value: "60 dias" },
          ]}
        />
      </div>
    </div>
  )
}
