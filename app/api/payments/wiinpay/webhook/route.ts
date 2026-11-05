import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getPixPayment, extractStatus, isPaidStatus } from "@/lib/wiinpay"
import { activateOrder } from "@/lib/pix-orders"

// A WiinPay não documenta verificação de assinatura pro webhook. Por
// segurança, NUNCA confiamos no corpo recebido pra decidir se foi pago —
// usamos ele só como aviso pra reconsultar o pagamento direto na WiinPay
// (GET /payment/list/{id}, autenticado com a nossa API key) antes de
// liberar qualquer acesso. Isso fecha o buraco de alguém forjar uma
// chamada "pago" sem precisar de assinatura documentada.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const d = (body.data as Record<string, unknown>) || body
  const wiinpayPaymentId = String(d.id ?? d.payment_id ?? d.paymentId ?? d.transaction_id ?? "")

  if (!wiinpayPaymentId) {
    return NextResponse.json({ error: "payment id ausente no corpo do webhook." }, { status: 400 })
  }

  const order = await prisma.pixOrder.findUnique({ where: { wiinpayPaymentId } })
  if (!order) {
    // Não é necessariamente um erro nosso (pode ser um teste da WiinPay).
    return NextResponse.json({ ok: true })
  }
  if (order.status === "paid") {
    return NextResponse.json({ ok: true })
  }

  try {
    const raw = await getPixPayment(wiinpayPaymentId)
    const status = extractStatus(raw)
    if (isPaidStatus(status)) {
      await activateOrder(order.id)
    }
  } catch (error) {
    console.error("[wiinpay-webhook] Falha ao confirmar pagamento", error)
    return NextResponse.json({ error: "Falha ao confirmar pagamento." }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
