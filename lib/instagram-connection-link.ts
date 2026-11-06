import { randomBytes } from "crypto"
import {
  buildInstagramAuthorizeUrl,
  getInstagramRedirectUri,
} from "@/lib/instagram-meta"
import { prisma } from "@/lib/prisma"
import { sealPayload } from "@/lib/secure-store"

const CONNECTION_TTL_MS = 10 * 60 * 1000

// Núcleo compartilhado por quem gera um link de conexão que completa sem
// sessão do dashboard — usado tanto pela API pública (/api/v1/connections,
// autenticada por token ifk_) quanto pelo botão "Gerar link de conexão" do
// próprio dashboard (autenticado por sessão, mas o link gerado funciona em
// qualquer aparelho/navegador, mesmo sem login lá — o estado cifrado com
// validade curta já garante quem pode completá-lo).
export async function createInstagramConnectionLink(params: {
  userId: string
  appConfigId: string
  username?: string | null
  request: Request
}) {
  const app = await prisma.instagramApp.findFirst({
    where: { id: params.appConfigId, userId: params.userId },
    select: { id: true, metaAppId: true },
  })

  if (!app) return { error: "app_not_found" as const }

  const expiresAt = new Date(Date.now() + CONNECTION_TTL_MS)

  const connectionRequest = await prisma.apiConnectionRequest.create({
    data: {
      userId: params.userId,
      appConfigId: app.id,
      expectedUsername: params.username || null,
      status: "pending",
      expiresAt,
    },
    select: { id: true, expiresAt: true },
  })

  const redirectUri = getInstagramRedirectUri(params.request)
  const state = sealPayload({
    userId: params.userId,
    appConfigId: app.id,
    expectedUsername: params.username || null,
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

  return {
    id: connectionRequest.id,
    authorizeUrl,
    expiresAt: connectionRequest.expiresAt,
  }
}
