import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { decryptValue, encryptValue } from "@/lib/secure-store"
import { normalizeStorritoBaseUrl, normalizeStorritoConnectLink } from "@/lib/storrito"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const connection = await prisma.storritoConnection.findUnique({
    where: { userId: session.user.id },
    select: { baseUrl: true, connectLinkEncrypted: true, updatedAt: true },
  })

  let connectLink: string | null = null
  if (connection?.connectLinkEncrypted) {
    try {
      connectLink = decryptValue(connection.connectLinkEncrypted)
    } catch {
      connectLink = null
    }
  }

  // O token da API nunca volta pro navegador — só se está configurado ou não.
  return NextResponse.json({
    configured: Boolean(connection),
    baseUrl: connection?.baseUrl || null,
    connectLink,
    updatedAt: connection?.updatedAt || null,
  })
}

// Cria ou atualiza a conexão. Com uma conexão já existente, cada campo é
// opcional: o que não vier continua como estava (ex.: salvar só o link de
// conexão sem digitar o token de novo).
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const existing = await prisma.storritoConnection.findUnique({
    where: { userId: session.user.id },
  })

  const rawBaseUrl = String(body.baseUrl || "").trim()
  const baseUrl = rawBaseUrl ? normalizeStorritoBaseUrl(rawBaseUrl) : existing?.baseUrl ?? null
  if (!baseUrl) {
    return NextResponse.json(
      { error: "URL base inválida. Use o formato https://SEU-CODIGO.storrito.com/api/v1" },
      { status: 400 }
    )
  }

  const rawToken = String(body.token || "").trim()
  let tokenEncrypted = existing?.tokenEncrypted ?? null
  if (rawToken) {
    if (rawToken.length < 10) {
      return NextResponse.json({ error: "Token da API inválido." }, { status: 400 })
    }
    tokenEncrypted = encryptValue(rawToken)
  }
  if (!tokenEncrypted) {
    return NextResponse.json({ error: "Informe o token da API do Storrito." }, { status: 400 })
  }

  let connectLinkEncrypted = existing?.connectLinkEncrypted ?? null
  if ("connectLink" in body) {
    const rawLink = String(body.connectLink || "").trim()
    if (!rawLink) {
      connectLinkEncrypted = null
    } else {
      const link = normalizeStorritoConnectLink(rawLink)
      if (!link) {
        return NextResponse.json(
          {
            error:
              "Link de conexão inválido. Use o formato https://CODIGO.storrito.com/ui/connect3?connect-link=...",
          },
          { status: 400 }
        )
      }
      connectLinkEncrypted = encryptValue(link)
    }
  }

  await prisma.storritoConnection.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, baseUrl, tokenEncrypted, connectLinkEncrypted },
    update: { baseUrl, tokenEncrypted, connectLinkEncrypted },
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
