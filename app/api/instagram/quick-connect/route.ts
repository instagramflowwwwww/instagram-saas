import { NextRequest, NextResponse } from "next/server"
import { getApiUserIdFromRawToken } from "@/lib/api-auth"
import { pickAppIdForUser } from "@/lib/instagram-default-app"
import { createInstagramConnectionLink } from "@/lib/instagram-connection-link"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Link fixo e bookmarkável (favoritado no navegador do celular/tablet) que
// nunca expira sozinho: cada vez que é aberto, gera na hora um novo pedido
// de conexão e já redireciona pro Instagram — sem precisar logar no
// InstaFlow nem reabrir o dashboard pra pegar um link novo toda vez. Usa o
// mesmo token ifk_... gerado em Configurações, só que lido da própria URL
// (?token=...) em vez do header Authorization, já que um link tocado/
// favoritado não tem como mandar header.
function errorPage(message: string) {
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" /><title>Não foi possível conectar · InstaFlow</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body{background:#0a0a0a;color:#e5e5e5;font-family:system-ui,-apple-system,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}
  .card{max-width:420px}
  h1{font-size:1.25rem;color:#ef4444;margin-bottom:.5rem}
  p{color:#a3a3a3;font-size:.9rem;line-height:1.5}
</style></head>
<body><div class="card"><h1>Não foi possível conectar</h1><p>${message}</p></div></body></html>`
  return new NextResponse(html, {
    status: 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || ""
  const username = String(request.nextUrl.searchParams.get("username") || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase()

  if (username && !/^[a-z0-9._]{1,30}$/.test(username)) {
    return errorPage("Usuário inválido no link.")
  }

  const userId = await getApiUserIdFromRawToken(token)
  if (!userId) {
    return errorPage("Este link não é mais válido. Gere um novo em Configurações.")
  }

  const appConfigId = await pickAppIdForUser(userId)
  if (!appConfigId) {
    return errorPage("Nenhum App Meta configurado nesta conta ainda.")
  }

  const result = await createInstagramConnectionLink({
    userId,
    appConfigId,
    username: username || null,
    request,
  })

  if ("error" in result) {
    return errorPage("App Meta não encontrado.")
  }

  return NextResponse.redirect(result.authorizeUrl)
}
