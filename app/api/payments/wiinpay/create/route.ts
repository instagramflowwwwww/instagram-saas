import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ACCESS_PLANS, type AccessPlanId } from "@/lib/account-access"
import { createPixPayment, extractPaymentId, extractPixCode } from "@/lib/wiinpay"

function getPublicUrl() {
  return (process.env.NEXT_PUBLIC_URL || "https://instaflowapp.com.br").replace(/\/$/, "")
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Faça login para assinar um plano." }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const planId = String(body.planId || "") as AccessPlanId
  const plan = ACCESS_PLANS[planId]

  if (!plan || !("priceBRL" in plan)) {
    return NextResponse.json({ error: "Plano inválido." }, { status: 400 })
  }

  const order = await prisma.pixOrder.create({
    data: {
      userId: session.user.id,
      planId: plan.id,
      amountBRL: plan.priceBRL,
      status: "pending",
    },
  })

  try {
    const raw = await createPixPayment({
      value: plan.priceBRL,
      name: session.user.name || session.user.email,
      email: session.user.email,
      description: `InstaFlow - plano ${plan.label}`,
      webhookUrl: `${getPublicUrl()}/api/payments/wiinpay/webhook`,
      metadata: { orderId: order.id, userId: session.user.id, planId: plan.id },
    })

    const wiinpayPaymentId = extractPaymentId(raw)
    const pixCode = extractPixCode(raw)

    if (!wiinpayPaymentId || !pixCode) {
      console.error("[wiinpay-create] Resposta sem id ou código Pix reconhecível", raw)
    }

    const updated = await prisma.pixOrder.update({
      where: { id: order.id },
      data: {
        wiinpayPaymentId,
        pixCode,
        rawCreateResponse: raw as object,
      },
    })

    if (!updated.pixCode) {
      return NextResponse.json(
        { error: "O pagamento foi criado, mas não veio um código Pix reconhecível na resposta." },
        { status: 502 }
      )
    }

    return NextResponse.json({
      orderId: updated.id,
      pixCode: updated.pixCode,
      value: plan.priceBRL,
      planLabel: plan.label,
    })
  } catch (error) {
    console.error("[wiinpay-create] Falha ao gerar pagamento", error)
    await prisma.pixOrder.update({ where: { id: order.id }, data: { status: "failed" } })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível gerar o Pix." },
      { status: 502 }
    )
  }
}
