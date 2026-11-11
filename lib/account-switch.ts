import { sealPayload, openPayload } from "@/lib/secure-store"

const TOKEN_TYPE = "account-switch"

// Mesmo prazo da sessão normal (180 dias) — trocar de conta usando esse
// token tem exatamente a mesma validade/confiança que a sessão já teria.
const TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000

export function createAccountSwitchToken(userId: string) {
  return sealPayload({
    type: TOKEN_TYPE,
    userId,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  })
}

export function readAccountSwitchToken(rawToken: string): string | null {
  try {
    const payload = openPayload<{
      type?: string
      userId?: string
      expiresAt?: number
    }>(rawToken)

    if (payload.type !== TOKEN_TYPE) return null
    if (!payload.userId) return null
    if (!payload.expiresAt || payload.expiresAt < Date.now()) return null

    return payload.userId
  } catch {
    return null
  }
}
