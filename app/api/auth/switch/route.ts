import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { readAccountSwitchToken } from "@/lib/account-switch"
import { setSessionCookie } from "@/lib/session-cookie"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Troca pra outra conta do InstaFlow já salva nesse navegador, sem precisar
// de email/senha de novo — recebe o token gerado por /api/auth/switch-token
// na hora em que aquela conta foi salva, e monta uma sessão nova pra ela. Não
// barra conta com plano vencido/pendente aqui — ela entra normal e o próprio
// dashboard mostra a tela de bloqueio explicando o motivo.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const rawToken = typeof body?.token === "string" ? body.token : ""

  const userId = rawToken ? readAccountSwitchToken(rawToken) : null
  if (!userId) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 })
  }

  const response = NextResponse.json({ ok: true })
  const cookieSet = await setSessionCookie(response, user.id)

  if (!cookieSet) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 })
  }

  return response
}
