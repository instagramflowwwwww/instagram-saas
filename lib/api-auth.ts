import { createHash, randomBytes } from "crypto"
import { prisma } from "@/lib/prisma"

export const API_TOKEN_PREFIX = "ifk_"

export function hashApiToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export function generateApiToken() {
  const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`
  return {
    token,
    tokenHash: hashApiToken(token),
    tokenPreview: `${token.slice(0, 10)}…${token.slice(-4)}`,
  }
}

// Núcleo de validação de um token ifk_ bruto — usado tanto pelo header
// Authorization (API pública) quanto por quem recebe o token de outro jeito
// (ex.: query param num link de "conectar rápido" feito pra ser tocado/
// aberto direto, sem como mandar header nenhum).
export async function getApiUserIdFromRawToken(rawToken: string): Promise<string | null> {
  if (!rawToken.startsWith(API_TOKEN_PREFIX)) return null

  const apiToken = await prisma.apiToken.findUnique({
    where: { tokenHash: hashApiToken(rawToken) },
    select: { id: true, userId: true, revokedAt: true, expiresAt: true },
  })

  if (!apiToken || apiToken.revokedAt) return null
  if (apiToken.expiresAt && apiToken.expiresAt < new Date()) return null

  prisma.apiToken
    .update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {})

  return apiToken.userId
}

// Autentica requisições da API pública (/api/v1/*) via
// "Authorization: Bearer ifk_...". Não aceita cookie/sessão do dashboard —
// é um mecanismo isolado, pensado para automações externas.
export async function getApiUserId(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization") || ""
  const match = header.match(/^Bearer\s+(ifk_[A-Za-z0-9_-]+)$/)
  if (!match) return null

  return getApiUserIdFromRawToken(match[1])
}
