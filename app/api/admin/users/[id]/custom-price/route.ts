import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { ACCESS_PLANS, isAdminEmail, type AccessPlanId } from "@/lib/account-access"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const CUSTOM_PRICE_PLAN_IDS = ["semanal", "mensal", "vitalicio"] as const

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const target = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!target) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const planId = String(body.planId || "") as AccessPlanId
  const priceBRL = Number(body.priceBRL)

  if (!CUSTOM_PRICE_PLAN_IDS.includes(planId as (typeof CUSTOM_PRICE_PLAN_IDS)[number])) {
    return NextResponse.json(
      { error: "Escolha um plano Semanal, Mensal ou Vitalício." },
      { status: 400 }
    )
  }
  // 3 reais é o mínimo aceito pela WiinPay pra gerar um Pix.
  if (!Number.isFinite(priceBRL) || priceBRL < 3) {
    return NextResponse.json({ error: "Informe um valor de pelo menos R$ 3." }, { status: 400 })
  }

  const plan = ACCESS_PLANS[planId]

  const user = await prisma.user.update({
    where: { id: target.id },
    data: { customPlanId: planId, customPriceBRL: Math.round(priceBRL) },
  })

  return NextResponse.json({
    user,
    message: `Preço personalizado definido: ${plan.label} por R$ ${Math.round(priceBRL)}.`,
  })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data: { customPlanId: null, customPriceBRL: null },
  })

  return NextResponse.json({ user, message: "Preço personalizado removido." })
}
