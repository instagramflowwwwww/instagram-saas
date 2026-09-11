"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Banknote, Loader2 } from "lucide-react"
import toast from "react-hot-toast"

type DaySeries = { day: string; accounts: number; amount: number }

type Employee = {
  id: string
  name: string
  color: string | null
  payPerAccount: number
  totalAccounts: number
  today: { accounts: number; amount: number }
  yesterday: { accounts: number; amount: number }
  last7: { accounts: number; amount: number }
  last30: { accounts: number; amount: number }
  series: DaySeries[]
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatDay(day: string) {
  const [, month, date] = day.split("-")
  return `${date}/${month}`
}

export default function PaymentsPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [totals, setTotals] = useState({ today: 0, last7: 0, last30: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/payments", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setEmployees(data.employees || [])
        setTotals(data.totals || { today: 0, last7: 0, last30: 0 })
      })
      .catch(() => toast.error("Erro ao carregar pagamentos"))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={24} className="animate-spin text-purple-400" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Pagamentos</h1>
        <p className="text-gray-500 mt-1">
          Quanto pagar por dia aos funcionários que criam contas, com base nas pastas marcadas.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Hoje", value: totals.today },
          { label: "Últimos 7 dias", value: totals.last7 },
          { label: "Últimos 30 dias", value: totals.last30 },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
            <p className="text-xs text-gray-500">{card.label}</p>
            <p className="mt-1.5 text-2xl font-bold text-white">{formatBRL(card.value)}</p>
          </div>
        ))}
      </div>

      {employees.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[#111] py-20 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/10">
            <Banknote size={24} className="text-green-400" />
          </div>
          <h3 className="mb-2 font-semibold text-white">Nenhum funcionário configurado</h3>
          <p className="mx-auto max-w-sm text-sm text-gray-500">
            Marque uma pasta como &quot;Funcionário de criar contas&quot; em{" "}
            <Link href="/dashboard/groups" className="text-purple-400 hover:text-purple-300">
              Pastas
            </Link>{" "}
            pra ela aparecer aqui, com o valor a pagar calculado por dia.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {employees.map((employee) => (
            <div key={employee.id} className="rounded-2xl border border-white/[0.07] bg-[#111] p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="h-4 w-4 shrink-0 rounded-full"
                    style={{ backgroundColor: employee.color || "#7C3AED" }}
                  />
                  <h2 className="font-semibold text-white">{employee.name}</h2>
                  <span className="text-xs text-gray-500">
                    R$ {employee.payPerAccount.toFixed(2).replace(".", ",")}/conta
                  </span>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-green-500/25 bg-green-500/10 px-3.5 py-2">
                  <span className="text-xs text-gray-400">Hoje</span>
                  <span className="text-sm font-semibold text-green-300">
                    {employee.today.accounts} conta(s) · {formatBRL(employee.today.amount)}
                  </span>
                </div>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Ontem", accounts: employee.yesterday.accounts, amount: employee.yesterday.amount },
                  { label: "7 dias", accounts: employee.last7.accounts, amount: employee.last7.amount },
                  { label: "30 dias", accounts: employee.last30.accounts, amount: employee.last30.amount },
                  { label: "Total", accounts: employee.totalAccounts, amount: null },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                    <p className="text-[11px] text-gray-500">{stat.label}</p>
                    <p className="text-sm font-medium text-white">{stat.accounts} conta(s)</p>
                    {stat.amount !== null && (
                      <p className="text-[11px] text-gray-500">{formatBRL(stat.amount)}</p>
                    )}
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto">
                <div className="flex gap-1.5">
                  {employee.series.map((entry) => (
                    <div
                      key={entry.day}
                      title={`${formatDay(entry.day)}: ${entry.accounts} conta(s) · ${formatBRL(entry.amount)}`}
                      className={`flex min-w-[34px] flex-1 flex-col items-center gap-1 rounded-lg border px-1 py-2 ${
                        entry.accounts > 0
                          ? "border-green-500/20 bg-green-500/5"
                          : "border-white/[0.05] bg-white/[0.015]"
                      }`}
                    >
                      <span
                        className={`text-xs font-semibold tabular-nums ${
                          entry.accounts > 0 ? "text-green-300" : "text-gray-700"
                        }`}
                      >
                        {entry.accounts}
                      </span>
                      <span className="text-[9px] text-gray-600">{formatDay(entry.day)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
