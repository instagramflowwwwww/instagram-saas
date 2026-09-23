import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { encryptValue } from "@/lib/secure-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const accounts = await prisma.unofficialAccount.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      username: true,
      status: true,
      lastError: true,
      lastAttemptAt: true,
      proxyUrl: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ accounts })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const username = String(body.username || "").trim().replace(/^@/, "").toLowerCase()
  const password = String(body.password || "")
  const totpSecret = String(body.totpSecret || "").trim()
  const proxyUrl = String(body.proxyUrl || "").trim()

  if (!username || !password) {
    return NextResponse.json(
      { error: "Informe usuário e senha do Instagram." },
      { status: 400 }
    )
  }

  const duplicate = await prisma.unofficialAccount.findFirst({
    where: { userId: session.user.id, username },
    select: { id: true },
  })
  if (duplicate) {
    return NextResponse.json(
      { error: "Essa conta já está cadastrada na API não oficial." },
      { status: 409 }
    )
  }

  const account = await prisma.unofficialAccount.create({
    data: {
      userId: session.user.id,
      username,
      passwordEncrypted: encryptValue(password),
      totpSecretEncrypted: totpSecret ? encryptValue(totpSecret) : null,
      proxyUrl: proxyUrl || null,
    },
    select: { id: true, username: true, status: true, createdAt: true },
  })

  return NextResponse.json({ account })
}
