import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { encryptValue } from "@/lib/secure-store"
import { normalizeStorritoBaseUrl } from "@/lib/storrito"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const connection = await prisma.storritoConnection.findUnique({
    where: { userId: session.user.id },
    select: { baseUrl: true, updatedAt: true },
  })

  // O token nunca volta pro navegador — só se está configurado ou não.
  return NextResponse.json({
    configured: Boolean(connection),
    baseUrl: connection?.baseUrl || null,
    updatedAt: connection?.updatedAt || null,
  })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const baseUrl = normalizeStorritoBaseUrl(String(body.baseUrl || ""))
  const token = String(body.token || "").trim()

  if (!baseUrl) {
    return NextResponse.json(
      { error: "URL base inválida. Use o formato https://SEU-CODIGO.storrito.com/api/v1" },
      { status: 400 }
    )
  }
  if (token.length < 10) {
    return NextResponse.json({ error: "Informe o token da API do Storrito." }, { status: 400 })
  }

  await prisma.storritoConnection.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, baseUrl, tokenEncrypted: encryptValue(token) },
    update: { baseUrl, tokenEncrypted: encryptValue(token) },
  })

  return NextResponse.json({ success: true })
}

export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  await prisma.storritoConnection.deleteMany({ where: { userId: session.user.id } })
  return NextResponse.json({ success: true })
}
