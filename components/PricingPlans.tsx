"use client"

import { Check, Crown, Zap } from "lucide-react"

const SUPPORT_EMAIL = "contato@automationpro.com.br"

const BASE_FEATURES = [
  "Contas ilimitadas do Instagram",
  "Automação de posts e Stories",
  "Biblioteca de mídia com pastas",
  "Fila de publicação com agendamento",
  "Performance em tempo real",
]

type Plan = {
  id: string
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

function mailtoFor(plan: Plan) {
  const subject = `Quero assinar o plano ${plan.label} do InstaFlow`
  const body = `Oi! Quero assinar o plano ${plan.label} (${formatBRL(plan.price)} ${plan.period}). Pode me passar os dados pra pagamento?`
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export function PricingPlans() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {PLANS.map((plan) => {
        const Icon = plan.icon
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

              <a
                href={mailtoFor(plan)}
                className={`mt-6 flex items-center justify-center rounded-xl py-3 text-sm font-semibold transition-opacity hover:opacity-90 ${
                  plan.highlight
                    ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                    : "border border-white/15 bg-white/5 text-white"
                }`}
              >
                Quero esse plano
              </a>
            </div>
          </div>
        )
      })}
    </div>
  )
}
