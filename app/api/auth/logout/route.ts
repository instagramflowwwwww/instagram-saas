import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const COOKIE_NAMES = ["__Secure-next-auth.session-token", "next-auth.session-token"]
const DOMAIN = process.env.NODE_ENV === "production" ? ".instaflowapp.com.br" : undefined

// Limpeza extra chamada antes do signOut() normal do NextAuth. Contas que
// logaram antes do cookie de sessão passar a usar domain=.instaflowapp.com.br
// (pra funcionar tanto em instaflowapp.com.br quanto em www.) ainda carregam
// a versão antiga "host-only" (sem domain) — o signOut() do NextAuth só
// limpa a versão configurada agora (com domain), então a antiga sobrava e a
// conta parecia "não sair". Aqui limpa as duas variantes, com e sem domain.
export async function POST() {
  const response = NextResponse.json({ ok: true })

  for (const name of COOKIE_NAMES) {
    response.cookies.set(name, "", { path: "/", maxAge: 0 })
    if (DOMAIN) {
      response.cookies.set(name, "", { path: "/", domain: DOMAIN, maxAge: 0 })
    }
  }

  return response
}
