import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { createInstagramConnectionLink } from "@/lib/instagram-connection-link"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Versão autenticada por sessão (dashboard) do /api/v1/connections: gera um
// link que, aberto em QUALQUER navegador/aparelho, conecta a conta sem
// precisar estar logado no InstaFlow ali — útil pra completar a conexão
// num celular/tablet diferente de onde você administra o InstaFlow.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const appConfigId = String(body.appConfigId || "").trim()
  const username = String(body.username || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase()

  if (!appConfigId) {
    return NextResponse.json({ error: "Escolha qual App Meta será usado." }, { status: 400 })
  }
  if (username && !/^[a-z0-9._]{1,30}$/.test(username)) {
    return NextResponse.json({ error: "Usuário inválido." }, { status: 400 })
  }

  const result = await createInstagramConnectionLink({
    userId: session.user.id,
    appConfigId,
    username: username || null,
    request,
  })

  if ("error" in result) {
    return NextResponse.json({ error: "App Meta não encontrado." }, { status: 404 })
  }

  return NextResponse.json(result, { status: 201 })
}
