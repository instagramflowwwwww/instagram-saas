import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getPixPayment, extractStatus, isPaidStatus } from "@/lib/wiinpay"
import { activateOrder } from "@/lib/pix-orders"

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 })
  }

  const orderId = new URL(request.url).searchParams.get("orderId")
  if (!orderId) {
    return NextResponse.json({ error: "orderId é obrigatório." }, { status: 400 })
  }

  const order = await prisma.pixOrder.findUnique({ where: { id: orderId } })
  if (!order || order.userId !== session.user.id) {
    return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 })
  }

  // Backup caso o webhook não chegue: reconsulta direto na WiinPay.
  if (order.status === "pending" && order.wiinpayPaymentId) {
    try {
      const raw = await getPixPayment(order.wiinpayPaymentId)
      const status = extractStatus(raw)
      if (isPaidStatus(status)) {
        await activateOrder(order.id)
        return NextResponse.json({ status: "paid" })
      }
    } catch (error) {
      console.error("[wiinpay-status] Falha ao reconsultar pagamento", error)
    }
  }

  return NextResponse.json({ status: order.status })
}
