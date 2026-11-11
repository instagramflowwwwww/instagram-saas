import { NextRequest, NextResponse } from "next/server"
import { getApiUserIdFromRawToken } from "@/lib/api-auth"
import { setSessionCookie } from "@/lib/session-cookie"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Link fixo e bookmarkável que já abre logado direto no dashboard — sem
// passar pelo fluxo de conectar Instagram (isso é o /api/instagram/quick-
// connect). Usa o mesmo token ifk_... gerado em Configurações. Entra mesmo
// se o plano estiver vencido/pendente: o próprio dashboard mostra a tela de
// bloqueio explicando o motivo, em vez de recusar o login aqui.
function errorPage(message: string) {
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" /><title>Não foi possível entrar · InstaFlow</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body{background:#0a0a0a;color:#e5e5e5;font-family:system-ui,-apple-system,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}
  .card{max-width:420px}
  h1{font-size:1.25rem;color:#ef4444;margin-bottom:.5rem}
  p{color:#a3a3a3;font-size:.9rem;line-height:1.5}
</style></head>
<body><div class="card"><h1>Não foi possível entrar</h1><p>${message}</p></div></body></html>`
  return new NextResponse(html, {
    status: 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || ""

  const userId = await getApiUserIdFromRawToken(token)
  if (!userId) {
    return errorPage("Este link não é mais válido. Gere um novo em Configurações.")
  }

  const response = NextResponse.redirect(new URL("/dashboard", request.url))
  const cookieSet = await setSessionCookie(response, userId)

  if (!cookieSet) {
    return errorPage("Erro interno do servidor. Tente de novo mais tarde.")
  }

  return response
}
