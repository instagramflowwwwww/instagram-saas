import { NextRequest, NextResponse } from "next/server"
import { encode } from "next-auth/jwt"
import { prisma } from "@/lib/prisma"
import { canAccessPlatform } from "@/lib/account-access"
import { readAccountSwitchToken } from "@/lib/account-switch"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SESSION_MAX_AGE = 180 * 24 * 60 * 60

// Mesmo nome/domínio de cookie configurados em lib/auth.ts — precisa bater
// certinho, senão essa troca de conta cria um cookie que o NextAuth não
// reconhece como o mesmo.
const isProduction = process.env.NODE_ENV === "production"
const COOKIE_NAME = isProduction
  ? "__Secure-next-auth.session-token"
  : "next-auth.session-token"
const COOKIE_DOMAIN = isProduction ? ".instaflowapp.com.br" : undefined

// Troca pra outra conta do InstaFlow já salva nesse navegador, sem precisar
// de email/senha de novo — recebe o token gerado por /api/auth/switch-token
// na hora em que aquela conta foi salva, e monta uma sessão nova pra ela.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const rawToken = typeof body?.token === "string" ? body.token : ""

  const userId = rawToken ? readAccountSwitchToken(rawToken) : null
  if (!userId) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 })
  }

  if (!canAccessPlatform(user)) {
    return NextResponse.json({ error: "account_blocked" }, { status: 403 })
  }

  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 })
  }

  const encoded = await encode({
    token: { id: user.id, sub: user.id },
    secret,
    maxAge: SESSION_MAX_AGE,
  })

  const response = NextResponse.json({ ok: true })
  response.cookies.set(COOKIE_NAME, encoded, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isProduction,
    domain: COOKIE_DOMAIN,
    maxAge: SESSION_MAX_AGE,
  })

  return response
}
