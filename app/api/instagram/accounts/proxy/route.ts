import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { parseProxyUrl } from "@/lib/proxy"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const { accountId, proxy } = await request.json()

  if (!accountId) {
    return NextResponse.json({ error: "Conta inválida" }, { status: 400 })
  }

  const account = await prisma.instagramAccount.findFirst({
    where: {
      id: String(accountId),
      userId: session.user.id,
    },
    select: { id: true },
  })

  if (!account) {
    return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 })
  }

  const normalizedProxy = proxy ? parseProxyUrl(String(proxy)) : null

  await prisma.instagramAccount.update({
    where: { id: account.id },
    data: { proxy: normalizedProxy },
  })

  return NextResponse.json({ success: true, proxy: normalizedProxy })
}
