"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Banknote, Calendar, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
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
  counts: Record<string, number>
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatDay(day: string) {
  const [, month, date] = day.split("-")
  return `${date}/${month}`
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"]

function buildCalendarCells(month: Date, counts: Record<string, number>, payPerAccount: number) {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const firstWeekday = new Date(year, monthIndex, 1).getDay()

  const cells: ({ key: string; day: number; accounts: number; amount: number } | null)[] = []
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null)
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${year}-${pad(monthIndex + 1)}-${pad(day)}`
    const accounts = counts[key] || 0
    cells.push({ key, day, accounts, amount: accounts * payPerAccount })
  }
  return cells
}

export default function PaymentsPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [totals, setTotals] = useState({ today: 0, last7: 0, last30: 0 })
  const [loading, setLoading] = useState(true)
  const [openCalendar, setOpenCalendar] = useState<Record<string, boolean>>({})
  const [calendarMonth, setCalendarMonth] = useState<Record<string, Date>>({})

  function toggleCalendar(employeeId: string) {
    setOpenCalendar((current) => ({ ...current, [employeeId]: !current[employeeId] }))
    setCalendarMonth((current) =>
      current[employeeId] ? current : { ...current, [employeeId]: new Date() }
    )
  }

  function shiftMonth(employeeId: string, delta: number) {
    setCalendarMonth((current) => {
      const base = current[employeeId] || new Date()
      return { ...current, [employeeId]: new Date(base.getFullYear(), base.getMonth() + delta, 1) }
    })
  }

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

              <button
                onClick={() => toggleCalendar(employee.id)}
                className="mt-3 flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300"
              >
                <Calendar size={13} />
                {openCalendar[employee.id] ? "Ocultar calendário" : "Ver calendário"}
              </button>

              {openCalendar[employee.id] && (
                <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <button
                      onClick={() => shiftMonth(employee.id, -1)}
                      className="rounded-lg p-1.5 text-gray-500 hover:bg-white/5 hover:text-white"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <p className="text-sm font-medium capitalize text-white">
                      {(calendarMonth[employee.id] || new Date()).toLocaleDateString("pt-BR", {
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                    <button
                      onClick={() => shiftMonth(employee.id, 1)}
                      className="rounded-lg p-1.5 text-gray-500 hover:bg-white/5 hover:text-white"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                  <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] text-gray-600">
                    {WEEKDAYS.map((label, index) => (
                      <span key={index}>{label}</span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {buildCalendarCells(
                      calendarMonth[employee.id] || new Date(),
                      employee.counts,
                      employee.payPerAccount
                    ).map((cell, index) =>
                      cell === null ? (
                        <div key={`empty-${index}`} />
                      ) : (
                        <div
                          key={cell.key}
                          title={
                            cell.accounts > 0
                              ? `${cell.accounts} conta(s) · ${formatBRL(cell.amount)}`
                              : undefined
                          }
                          className={`flex aspect-square flex-col items-center justify-center rounded-lg border text-[11px] ${
                            cell.accounts > 0
                              ? "border-green-500/25 bg-green-500/10 text-green-300"
                              : "border-white/[0.05] bg-white/[0.015] text-gray-600"
                          }`}
                        >
                          <span>{cell.day}</span>
                          {cell.accounts > 0 && <span className="text-[9px]">{cell.accounts}</span>}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
