import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { isAdminEmail } from "@/lib/account-access"
import { authOptions } from "@/lib/auth"
import { removeDefaultInstagramAppIfUnused } from "@/lib/instagram-default-app"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

// Liga/desliga, por usuário, o acesso ao "App Padrão" compartilhado
// (lib/instagram-default-app.ts). Bloquear não derruba contas que a pessoa
// já conectou com ele — só impede conexões novas, e apaga a linha do App
// Padrão dela se nenhuma conta estiver usando (ver removeDefaultInstagramAppIfUnused).
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const blocked = Boolean(body.blocked)

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, email: true },
  })
  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 })
  }
  if (isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Não se aplica a contas de admin." }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { defaultAppBlocked: blocked },
  })

  if (!blocked) {
    return NextResponse.json({
      success: true,
      defaultAppBlocked: false,
      message: "App Padrão liberado para esse usuário de novo.",
    })
  }

  const { removed, accountsUsingIt } = await removeDefaultInstagramAppIfUnused(user.id)

  return NextResponse.json({
    success: true,
    defaultAppBlocked: true,
    removed,
    accountsUsingIt,
    message: removed
      ? "App Padrão removido dessa conta. Ela vai precisar cadastrar o próprio App Meta pra conectar mais contas."
      : `Bloqueado pra conexões novas, mas a linha do App Padrão ficou porque ${accountsUsingIt} conta(s) ainda publicam com ele.`,
  })
}
