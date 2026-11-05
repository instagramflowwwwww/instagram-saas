"use client"

import { Gem } from "lucide-react"
import { PricingPlans } from "@/components/PricingPlans"

export default function DashboardPlansPage() {
  return (
    <div
      className="relative -m-4 min-w-0 overflow-x-hidden p-4 md:-m-8 md:p-8"
      style={{
        background:
          "radial-gradient(900px 480px at 12% -10%, rgba(192,132,252,0.16), transparent 60%), radial-gradient(800px 420px at 92% 0%, rgba(236,72,153,0.12), transparent 55%), #08080a",
      }}
    >
      <div className="mb-8 flex items-center gap-3">
        <Gem size={21} className="text-purple-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Planos</h1>
          <p className="mt-1 text-sm text-gray-500">
            Assine ou renove seu acesso ao InstaFlow. Sem fidelidade — mude de plano quando quiser.
          </p>
        </div>
      </div>

      <PricingPlans mode="checkout" />

      <p className="mt-8 text-sm text-gray-500">
        O pagamento é via Pix. Assim que confirmar, seu acesso é liberado na hora — não precisa
        esperar ninguém aprovar.
      </p>
    </div>
  )
}
