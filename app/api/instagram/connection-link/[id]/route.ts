import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Consulta o status de um link gerado em /api/instagram/connection-link —
// pro dashboard saber, enquanto o link é aberto em outro aparelho, se já
// conectou, falhou ou ainda está pendente (polling).
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const connectionRequest = await prisma.apiConnectionRequest.findFirst({
    where: { id: params.id, userId: session.user.id },
  })

  if (!connectionRequest) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  let status = connectionRequest.status
  if (status === "pending" && connectionRequest.expiresAt < new Date()) {
    status = "expired"
    await prisma.apiConnectionRequest
      .update({ where: { id: connectionRequest.id }, data: { status: "expired" } })
      .catch(() => {})
  }

  return NextResponse.json({
    id: connectionRequest.id,
    status,
    username: connectionRequest.connectedUsername,
    instagramAccountId: connectionRequest.instagramAccountId,
    errorMessage: connectionRequest.errorMessage,
    expiresAt: connectionRequest.expiresAt,
  })
}
