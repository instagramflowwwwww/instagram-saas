import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getStorritoConnection, listInstagramUsers, StorritoError } from "@/lib/storrito"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const connection = await getStorritoConnection(session.user.id)
  if (!connection) {
    return NextResponse.json({ error: "Storrito não configurado." }, { status: 400 })
  }

  try {
    const result = await listInstagramUsers(connection)
    return NextResponse.json({
      accounts: (result.instagramUsers || []).map((user) => ({
        username: user.instagramUsername,
      })),
    })
  } catch (error) {
    const status = error instanceof StorritoError ? 502 : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao consultar o Storrito." },
      { status }
    )
  }
}
