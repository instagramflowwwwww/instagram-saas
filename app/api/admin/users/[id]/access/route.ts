import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import {
  addPlanDays,
  getPlan,
  isAdminEmail,
} from "@/lib/account-access"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      email: true,
      accessStatus: true,
      accessExpiresAt: true,
    },
  })

  if (!target) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 })
  }

  if (isAdminEmail(target.email)) {
    return NextResponse.json(
      { error: "A conta principal do administrador não pode ser alterada." },
      { status: 400 }
    )
  }

  const body = await request.json()
  const action = String(body.action || "")

  if (action === "reject") {
    const user = await prisma.user.update({
      where: { id: target.id },
      data: {
        accessStatus: "rejected",
        planName: null,
        planDurationDays: null,
        accessStartsAt: null,
        accessExpiresAt: null,
        approvedAt: null,
        rejectedAt: new Date(),
      },
    })

    return NextResponse.json({ user, message: "Cadastro recusado." })
  }

  if (action !== "approve") {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 })
  }

  const plan = getPlan(body.plan)
  if (!plan) {
    return NextResponse.json(
      { error: "Selecione o plano VIP ou Premium." },
      { status: 400 }
    )
  }

  const now = new Date()
  const currentExpiration = target.accessExpiresAt
  const renewalBase =
    target.accessStatus === "approved" &&
    currentExpiration &&
    currentExpiration.getTime() > now.getTime()
      ? currentExpiration
      : now
  const expiresAt = addPlanDays(renewalBase, plan.days)

  const user = await prisma.user.update({
    where: { id: target.id },
    data: {
      accessStatus: "approved",
      planName: plan.id,
      planDurationDays: plan.days,
      accessStartsAt: now,
      accessExpiresAt: expiresAt,
      approvedAt: now,
      rejectedAt: null,
    },
  })

  return NextResponse.json({
    user,
    message: `${plan.label} ativado por ${plan.days} dias.`,
  })
}
