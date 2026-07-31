"use client"

import { type ChangeEvent, useCallback, useEffect, useState } from "react"
import {
  Check,
  Database,
  Loader2,
  Network,
  RefreshCw,
  ShieldOff,
  Upload,
  X,
} from "lucide-react"

type ProxyStats = {
  total: number
  available: number
  assigned: number
  consumed: number
  inactive: number
}

type ProxyFile = {
  proxies?: unknown
}

export default function AdminProxiesPage() {
  const [stats, setStats] = useState<ProxyStats | null>(null)
  const [proxies, setProxies] = useState<string[]>([])
  const [fileName, setFileName] = useState("")
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const loadStats = useCallback(async () => {
    setError("")

    try {
      const response = await fetch("/api/admin/proxies", {
        cache: "no-store",
      })

      if (response.status === 403) {
        setForbidden(true)
        return
      }

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível carregar o pool.")
      }

      setStats(payload)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível carregar o pool."
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    setMessage("")
    setError("")
    setProxies([])

    const file = event.target.files?.[0]
    if (!file) {
      setFileName("")
      return
    }

    try {
      const parsed = JSON.parse(await file.text()) as ProxyFile | string[]
      const values = Array.isArray(parsed) ? parsed : parsed.proxies

      if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) {
        throw new Error(
          'Arquivo inválido. Use { "proxies": ["host:porta:usuario:senha"] }.'
        )
      }

      setFileName(file.name)
      setProxies(values as string[])
    } catch (fileError) {
      setFileName("")
      setError(
        fileError instanceof Error
          ? fileError.message
          : "Não foi possível ler o arquivo."
      )
    }
  }

  const importFile = async () => {
    if (proxies.length === 0) return

    setImporting(true)
    setMessage("")
    setError("")

    try {
      const response = await fetch("/api/admin/proxies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxies }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível importar as proxies.")
      }

      setStats(payload.stats)
      setMessage(
        `${payload.inserted} proxies adicionadas. ${payload.duplicates} já existiam no banco.`
      )
      setProxies([])
      setFileName("")
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível importar as proxies."
      )
    } finally {
      setImporting(false)
    }
  }

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
        <p className="text-sm text-gray-500">
          Somente o administrador pode importar proxies.
        </p>
      </div>
    )
  }

  const cards = [
    { label: "Total", value: stats?.total || 0 },
    { label: "Disponíveis", value: stats?.available || 0 },
    { label: "Atribuídas", value: stats?.assigned || 0 },
    { label: "Consumidas", value: stats?.consumed || 0 },
  ]

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Network size={21} className="text-purple-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Pool de proxies</h1>
            <p className="mt-1 text-sm text-gray-500">
              Cada conta recebe uma proxy exclusiva, armazenada criptografada.
            </p>
          </div>
        </div>
        <button
          onClick={() => void loadStats()}
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

      <div className="mb-7 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-white/5 bg-[#111] p-5">
            <p className="text-xs text-gray-500">{card.label}</p>
            <p className="mt-2 text-2xl font-bold text-white">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/5 bg-[#111] p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
            <Database size={18} className="text-purple-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Importar arquivo JSON</h2>
            <p className="mt-1 text-xs text-gray-500">
              Proxies já usadas continuam consumidas mesmo após excluir uma conta.
            </p>
          </div>
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-5 hover:border-purple-500/30">
          <div>
            <p className="text-sm font-medium text-gray-200">
              {fileName || "Selecionar proxies-corrigidas.json"}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Formato: host:porta:usuario:senha
            </p>
          </div>
          <Upload size={18} className="text-purple-400" />
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void selectFile(event)}
          />
        </label>

        <div className="mt-5 flex items-center justify-between gap-4">
          <span className="text-xs text-gray-500">
            {proxies.length > 0 ? `${proxies.length} proxies prontas para importar` : "Nenhum arquivo selecionado"}
          </span>
          <button
            onClick={() => void importFile()}
            disabled={proxies.length === 0 || importing}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {importing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            Importar proxies
          </button>
        </div>
      </div>
    </div>
  )
}
