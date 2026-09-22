import { randomBytes } from "crypto"
import { NextResponse } from "next/server"
import { getApiUserId } from "@/lib/api-auth"
import {
  buildInstagramAuthorizeUrl,
  getInstagramRedirectUri,
} from "@/lib/instagram-meta"
import { prisma } from "@/lib/prisma"
import { sealPayload } from "@/lib/secure-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CONNECTION_TTL_MS = 10 * 60 * 1000

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

  const app = await prisma.instagramApp.findFirst({
    where: { id: appConfigId, userId },
    select: { id: true, metaAppId: true },
  })

  if (!app) {
    return NextResponse.json(
      { error: "app_not_found", message: "App Meta não encontrado para esta conta." },
      { status: 404 }
    )
  }

  const expiresAt = new Date(Date.now() + CONNECTION_TTL_MS)

  const connectionRequest = await prisma.apiConnectionRequest.create({
    data: {
      userId,
      appConfigId: app.id,
      expectedUsername: username || null,
      status: "pending",
      expiresAt,
    },
    select: { id: true, expiresAt: true },
  })

  const redirectUri = getInstagramRedirectUri(request)
  const state = sealPayload({
    userId,
    appConfigId: app.id,
    expectedUsername: username || null,
    redirectUri,
    connectionRequestId: connectionRequest.id,
    nonce: randomBytes(18).toString("hex"),
    expiresAt: expiresAt.getTime(),
  })

  const authorizeUrl = buildInstagramAuthorizeUrl({
    metaAppId: app.metaAppId,
    redirectUri,
    state,
  })

  return NextResponse.json(
    {
      id: connectionRequest.id,
      authorizeUrl,
      expiresAt: connectionRequest.expiresAt,
    },
    { status: 201 }
  )
}
