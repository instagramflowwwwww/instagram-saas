"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Copy, Crown, Loader2, X, Zap } from "lucide-react"
import toast from "react-hot-toast"

const BASE_FEATURES = [
  "Contas ilimitadas do Instagram",
  "Automação de posts e Stories",
  "Biblioteca de mídia com pastas",
  "Fila de publicação com agendamento",
  "Performance em tempo real",
]

type Plan = {
  id: "semanal" | "mensal" | "vitalicio"
  label: string
  price: number
  period: string
  description: string
  features: string[]
  highlight?: boolean
  badge?: string
  icon?: typeof Zap
}

const PLANS: Plan[] = [
  {
    id: "semanal",
    label: "Semanal",
    price: 400,
    period: "por semana",
    description: "Pra quem quer testar sem compromisso.",
    features: BASE_FEATURES,
  },
  {
    id: "mensal",
    label: "Mensal",
    price: 800,
    period: "por mês",
    description: "O plano mais usado — fôlego pra operar o mês inteiro.",
    features: [...BASE_FEATURES, "Suporte por e-mail"],
    highlight: true,
    badge: "Mais popular",
    icon: Zap,
  },
  {
    id: "vitalicio",
    label: "Vitalício",
    price: 1600,
    period: "pagamento único",
    description: "Pague uma vez, use o InstaFlow pra sempre.",
    features: [...BASE_FEATURES, "Suporte por e-mail", "Todas as atualizações futuras inclusas"],
    badge: "Pague uma vez",
    icon: Crown,
  },
]

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  })
}

type ActiveOrder = {
  orderId: string
  pixCode: string
  value: number
  planLabel: string
}

type PricingPlansProps = {
  /** "marketing": visitante sem login, manda pra /login. "checkout": usuário logado, paga de verdade com Pix via WiinPay. */
  mode?: "marketing" | "checkout"
}

export function PricingPlans({ mode = "marketing" }: PricingPlansProps) {
  const [creatingFor, setCreatingFor] = useState<Plan["id"] | null>(null)
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null)
  const [paid, setPaid] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  const startPolling = (orderId: string) => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/payments/wiinpay/status?orderId=${orderId}`, {
          cache: "no-store",
        })
        const data = await response.json().catch(() => ({}))
        if (data.status === "paid") {
          stopPolling()
          setPaid(true)
          toast.success("Pagamento confirmado! Seu plano já está ativo.")
        }
      } catch {
        // tenta de novo no próximo intervalo
      }
    }, 4000)
  }

  const handleSelect = async (plan: Plan) => {
    setCreatingFor(plan.id)
    try {
      const response = await fetch("/api/payments/wiinpay/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Não foi possível gerar o Pix.")

      setPaid(false)
      setActiveOrder({
        orderId: data.orderId,
        pixCode: data.pixCode,
        value: data.value,
        planLabel: data.planLabel,
      })
      startPolling(data.orderId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o Pix.")
    } finally {
      setCreatingFor(null)
    }
  }

  const closeModal = () => {
    stopPolling()
    setActiveOrder(null)
    setPaid(false)
  }

  const copyCode = async () => {
    if (!activeOrder) return
    try {
      await navigator.clipboard.writeText(activeOrder.pixCode)
      toast.success("Código Pix copiado.")
    } catch {
      toast.error("Não foi possível copiar o código.")
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {PLANS.map((plan) => {
          const Icon = plan.icon
          const href = mode === "marketing" ? "/login" : undefined
          const Tag = href ? "a" : "button"

          return (
            <div
              key={plan.id}
              className="rounded-2xl p-px"
              style={{
                background: plan.highlight
                  ? "linear-gradient(135deg, rgba(192,132,252,0.55), rgba(255,255,255,0.03) 40%, rgba(236,72,153,0.3) 100%)"
                  : "linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02) 60%)",
              }}
            >
              <div
                className={`flex h-full flex-col rounded-[15px] p-6 ${
                  plan.highlight ? "bg-[#120f1a]" : "bg-[#0d0d10]"
                }`}
              >
                {plan.badge && (
                  <span
                    className={`mb-4 inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                      plan.highlight
                        ? "border-purple-400/40 bg-purple-500/15 text-purple-200"
                        : "border-amber-400/30 bg-amber-500/10 text-amber-300"
                    }`}
                  >
                    {Icon && <Icon size={12} />}
                    {plan.badge}
                  </span>
                )}

                <h3 className="text-lg font-bold text-white">{plan.label}</h3>
                <p className="mt-1 text-sm text-gray-500">{plan.description}</p>

                <div className="mt-5 flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold tracking-tight text-white">
                    {formatBRL(plan.price)}
                  </span>
                  <span className="text-sm text-gray-500">{plan.period}</span>
                </div>

                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm text-gray-300">
                      <Check size={15} className="mt-0.5 shrink-0 text-purple-400" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Tag
                  href={href}
                  onClick={mode === "checkout" ? () => void handleSelect(plan) : undefined}
                  disabled={mode === "checkout" ? creatingFor !== null : undefined}
                  className={`mt-6 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${
                    plan.highlight
                      ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                      : "border border-white/15 bg-white/5 text-white"
                  }`}
                >
                  {creatingFor === plan.id && <Loader2 size={15} className="animate-spin" />}
                  {mode === "marketing"
                    ? "Criar conta e assinar"
                    : creatingFor === plan.id
                      ? "Gerando Pix..."
                      : "Pagar com Pix"}
                </Tag>
              </div>
            </div>
          )
        })}
      </div>

      {activeOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d0d10] p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-white">Pagar com Pix</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  Plano {activeOrder.planLabel} · {formatBRL(activeOrder.value)}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="shrink-0 text-gray-500 hover:text-white"
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            {paid ? (
              <div className="mt-6 flex flex-col items-center gap-3 py-6 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-500/10">
                  <Check size={24} className="text-green-400" />
                </span>
                <p className="text-sm font-medium text-white">Pagamento confirmado!</p>
                <p className="text-xs text-gray-500">Seu plano já está ativo. Pode fechar essa janela.</p>
              </div>
            ) : (
              <>
                <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
                  <p className="break-all font-mono text-[11px] leading-relaxed text-gray-300">
                    {activeOrder.pixCode}
                  </p>
                </div>
                <button
                  onClick={copyCode}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-purple-500/25 bg-purple-500/10 py-2.5 text-sm font-medium text-purple-300 hover:bg-purple-500/15"
                >
                  <Copy size={14} />
                  Copiar código Pix
                </button>
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-500">
                  <Loader2 size={13} className="animate-spin" />
                  Aguardando confirmação do pagamento...
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
