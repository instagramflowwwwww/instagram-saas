import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const account = await prisma.unofficialAccount.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: { id: true },
  })
  if (!account) {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 })
  }

  await prisma.unofficialAccount.delete({ where: { id: account.id } })

  return NextResponse.json({ success: true })
}
