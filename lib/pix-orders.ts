import { prisma } from "@/lib/prisma"
import { ACCESS_PLANS, addPlanDays, type AccessPlanId } from "@/lib/account-access"

// Confirma um PixOrder como pago e estende o acesso do usuário, igual ao
// admin faz manualmente em /api/admin/users/[id]/access. Idempotente:
// chamar de novo pra um pedido já pago não faz nada.
export async function activateOrder(orderId: string) {
  const order = await prisma.pixOrder.findUnique({ where: { id: orderId } })
  if (!order || order.status === "paid") return order

  const plan = ACCESS_PLANS[order.planId as AccessPlanId]
  if (!plan) throw new Error(`Plano desconhecido no pedido ${orderId}: ${order.planId}`)

  const user = await prisma.user.findUnique({
    where: { id: order.userId },
    select: { accessStatus: true, accessExpiresAt: true },
  })

  const now = new Date()
  const renewalBase =
    user?.accessStatus === "approved" &&
    user.accessExpiresAt &&
    user.accessExpiresAt.getTime() > now.getTime()
      ? user.accessExpiresAt
      : now
  const expiresAt = plan.days === null ? null : addPlanDays(renewalBase, plan.days)

  await prisma.$transaction([
    prisma.user.update({
      where: { id: order.userId },
      data: {
        accessStatus: "approved",
        planName: plan.id,
        planDurationDays: plan.days,
        accessStartsAt: now,
        accessExpiresAt: expiresAt,
        approvedAt: now,
        rejectedAt: null,
      },
    }),
    prisma.pixOrder.update({
      where: { id: order.id },
      data: { status: "paid", paidAt: now },
    }),
  ])

  return order
}
