import { encode } from "next-auth/jwt"
import type { NextResponse } from "next/server"

const isProduction = process.env.NODE_ENV === "production"

// Precisa bater certinho com o bloco `cookies` de lib/auth.ts — usado por
// qualquer rota que monte uma sessão sem passar pelo fluxo normal de login
// (troca de conta, link de login rápido).
export const SESSION_COOKIE_NAME = isProduction
  ? "__Secure-next-auth.session-token"
  : "next-auth.session-token"
const SESSION_COOKIE_DOMAIN = isProduction ? ".instaflowapp.com.br" : undefined
const SESSION_MAX_AGE = 180 * 24 * 60 * 60

export async function setSessionCookie(response: NextResponse, userId: string) {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) return false

  const encoded = await encode({
    token: { id: userId, sub: userId },
    secret,
    maxAge: SESSION_MAX_AGE,
  })

  response.cookies.set(SESSION_COOKIE_NAME, encoded, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isProduction,
    domain: SESSION_COOKIE_DOMAIN,
    maxAge: SESSION_MAX_AGE,
  })

  return true
}
