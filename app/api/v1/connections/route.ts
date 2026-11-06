import { NextResponse } from "next/server"
import { getApiUserId } from "@/lib/api-auth"
import { createInstagramConnectionLink } from "@/lib/instagram-connection-link"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const userId = await getApiUserId(request)

  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const appConfigId = String(body.appConfigId || "").trim()
  const username = String(body.username || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase()

  if (!appConfigId) {
    return NextResponse.json(
      { error: "invalid_request", message: "appConfigId é obrigatório." },
      { status: 400 }
    )
  }

  if (username && !/^[a-z0-9._]{1,30}$/.test(username)) {
    return NextResponse.json(
      { error: "invalid_request", message: "username inválido." },
      { status: 400 }
    )
  }

  const result = await createInstagramConnectionLink({
    userId,
    appConfigId,
    username: username || null,
    request,
  })

  if ("error" in result) {
    return NextResponse.json(
      { error: "app_not_found", message: "App Meta não encontrado para esta conta." },
      { status: 404 }
    )
  }

  return NextResponse.json(result, { status: 201 })
}
