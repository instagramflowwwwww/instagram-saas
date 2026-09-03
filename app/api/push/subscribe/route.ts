import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const endpoint = String(body.endpoint || "").trim()
  const p256dh = String(body.keys?.p256dh || "").trim()
  const auth = String(body.keys?.auth || "").trim()

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Inscrição de notificação inválida." }, { status: 400 })
  }

  // upsert pelo endpoint: o mesmo navegador reenviando a inscrição não deve
  // criar linha duplicada, e uma inscrição que mudou de dono (troca de login
  // no mesmo aparelho) passa a apontar para o usuário certo.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: session.user.id, endpoint, p256dh, auth },
    update: { userId: session.user.id, p256dh, auth },
  })

  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const endpoint = String(body.endpoint || "").trim()
  if (!endpoint) {
    return NextResponse.json({ error: "Endpoint não informado." }, { status: 400 })
  }

  await prisma.pushSubscription.deleteMany({
    where: { endpoint, userId: session.user.id },
  })

  return NextResponse.json({ success: true })
}
