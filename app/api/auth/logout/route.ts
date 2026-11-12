import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const isProduction = process.env.NODE_ENV === "production"
const COOKIE_NAMES = ["__Secure-next-auth.session-token", "next-auth.session-token"]
const DOMAIN = isProduction ? ".instaflowapp.com.br" : undefined

// response.cookies.set() guarda os cookies da resposta num mapa indexado só
// pelo NOME — chamar .set() de novo com o mesmo nome (pra limpar a variante
// sem domain e a variante com domain) sobrescrevia a primeira chamada por
// dentro, e só um dos dois Set-Cookie saía de verdade. Por isso precisa
// montar a string crua e usar headers.append (Set-Cookie é o único header
// que pode se repetir várias vezes numa resposta HTTP).
function buildClearCookie(name: string, domain?: string) {
  const parts = [`${name}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax"]
  if (isProduction) parts.push("Secure")
  if (domain) parts.push(`Domain=${domain}`)
  return parts.join("; ")
}

// Limpeza extra chamada antes do signOut() normal do NextAuth. Contas que
// logaram antes do cookie de sessão passar a usar domain=.instaflowapp.com.br
// (pra funcionar tanto em instaflowapp.com.br quanto em www.) ainda carregam
// a versão antiga "host-only" (sem domain) — o signOut() do NextAuth só
// limpa a versão configurada agora (com domain), então a antiga sobrava e a
// conta parecia "não sair". Aqui limpa as duas variantes, com e sem domain.
export async function POST() {
  const response = NextResponse.json({ ok: true })

  for (const name of COOKIE_NAMES) {
    response.headers.append("Set-Cookie", buildClearCookie(name))
    if (DOMAIN) {
      response.headers.append("Set-Cookie", buildClearCookie(name, DOMAIN))
    }
  }

  return response
}
