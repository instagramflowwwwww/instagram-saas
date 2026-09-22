import { NextResponse } from "next/server"
import { getApiUserId } from "@/lib/api-auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getApiUserId(request)

  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const connectionRequest = await prisma.apiConnectionRequest.findFirst({
    where: { id: params.id, userId },
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

  const base = {
    id: connectionRequest.id,
    status,
    appConfigId: connectionRequest.appConfigId,
    expiresAt: connectionRequest.expiresAt,
    createdAt: connectionRequest.createdAt,
  }

  if (status === "connected") {
    return NextResponse.json({
      ...base,
      username: connectionRequest.connectedUsername,
      instagramAccountId: connectionRequest.instagramAccountId,
    })
  }

  if (status === "failed") {
    return NextResponse.json({
      ...base,
      errorCode: connectionRequest.errorCode || "unknown_error",
      errorMessage: connectionRequest.errorMessage || "Falha ao conectar a conta.",
    })
  }

  return NextResponse.json(base)
}
