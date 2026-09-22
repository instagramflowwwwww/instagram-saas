import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { generateApiToken } from "@/lib/api-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

// Gerenciamento dos tokens ifk_ usados pela API pública (/api/v1/*).
// Protegido por sessão do dashboard — só quem está logado pode criar ou
// revogar tokens da própria conta. O valor em texto puro só existe na
// resposta do POST, nunca fica salvo (só o hash).

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const tokens = await prisma.apiToken.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      tokenPreview: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ tokens })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const name = String(body.name || "").trim().slice(0, 60) || "Token de automação"

  const { token, tokenHash, tokenPreview } = generateApiToken()

  const created = await prisma.apiToken.create({
    data: { userId: session.user.id, name, tokenHash, tokenPreview },
    select: { id: true, name: true, createdAt: true },
  })

  return NextResponse.json({
    id: created.id,
    name: created.name,
    token, // só aparece agora — guarde em lugar seguro
    tokenPreview,
    createdAt: created.createdAt,
  })
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const id = String(body.id || "").trim()
  if (!id) {
    return NextResponse.json({ error: "id é obrigatório." }, { status: 400 })
  }

  const token = await prisma.apiToken.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!token) {
    return NextResponse.json({ error: "Token não encontrado." }, { status: 404 })
  }

  await prisma.apiToken.update({
    where: { id: token.id },
    data: { revokedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
