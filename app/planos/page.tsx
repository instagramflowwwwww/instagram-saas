import Link from "next/link"
import { ArrowLeft, Check } from "lucide-react"
import { Wordmark } from "@/components/Wordmark"
import { PricingPlans } from "@/components/PricingPlans"

const FEATURES = ["Instagram", "Automação", "Biblioteca", "Fila", "Performance"]

export default function PlansPage() {
  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "radial-gradient(900px 480px at 12% -10%, rgba(192,132,252,0.16), transparent 60%), radial-gradient(800px 420px at 92% 0%, rgba(236,72,153,0.12), transparent 55%), #08080a",
      }}
    >
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-8">
        <Link href="/login" className="flex items-center gap-3">
          <img
            src="/logo/logosfundo.png"
            alt="Logo InstaFlow"
            className="h-9 w-9 shrink-0 rounded-xl object-contain"
          />
          <Wordmark className="text-xl font-bold text-white" />
        </Link>
        <Link
          href="/login"
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white"
        >
          <ArrowLeft size={14} />
          Voltar
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-24 pt-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-4 flex items-center justify-center gap-2">
            <span className="h-px w-6 bg-purple-500" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-400">
              Planos do InstaFlow
            </span>
            <span className="h-px w-6 bg-purple-500" />
          </div>
          <h1 className="text-4xl font-bold leading-tight text-white">
            Escolha como quer publicar no Instagram.
          </h1>
          <p className="mt-4 text-gray-500">
            Sem contrato de fidelidade. Escolha o plano que faz sentido pro seu momento e
            comece a automatizar suas contas hoje.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {FEATURES.map((feature) => (
            <span key={feature} className="flex items-center gap-1.5 text-xs text-gray-500">
              <Check size={12} className="text-purple-400" />
              {feature}
            </span>
          ))}
        </div>

        <div className="mt-14">
          <PricingPlans />
        </div>

        <p className="mt-10 text-center text-xs text-gray-600">
          Já assinou? Entre em contato pelo e-mail e nosso time libera o acesso assim que o
          pagamento for confirmado.
        </p>
      </main>
    </div>
  )
}
