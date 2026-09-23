import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const account = await prisma.unofficialAccount.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: { username: true, lastError: true, lastDiagnostic: true },
  })

  if (!account) {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 })
  }

  if (!account.lastDiagnostic) {
    return NextResponse.json(
      { error: "Ainda não há diagnóstico salvo para esta conta." },
      { status: 404 }
    )
  }

  try {
    return NextResponse.json({
      username: account.username,
      lastError: account.lastError,
      diagnostic: JSON.parse(account.lastDiagnostic),
    })
  } catch {
    return NextResponse.json({ error: "Diagnóstico ilegível." }, { status: 500 })
  }
}
