import { prisma } from "@/lib/prisma"

export const INSTAGRAM_OFFICIAL_CONNECTION = "official"
export const INSTAGRAM_DISCONNECTED_CONNECTION = "official_disconnected"
export const INSTAGRAM_RECONNECT_GRACE_MS = 24 * 60 * 60 * 1000

type InstagramAccountState = {
  connectionType: string
  isActive: boolean
  accessToken?: string | null
  tokenExpiresAt: Date | null
  appConfigId?: string | null
}

export function isInstagramAccountUsable(
  account: InstagramAccountState,
  now = Date.now()
) {
  return (
    account.connectionType === INSTAGRAM_OFFICIAL_CONNECTION &&
    account.isActive &&
    Boolean(account.accessToken) &&
    Boolean(account.appConfigId) &&
    Boolean(account.tokenExpiresAt && account.tokenExpiresAt.getTime() > now)
  )
}

export function requiresInstagramReconnect(account: InstagramAccountState) {
  return !isInstagramAccountUsable(account)
}

export function instagramDisconnectDeadline(account: {
  connectionType: string
  isActive: boolean
  lastActiveAt: Date
}) {
  if (
    account.connectionType !== INSTAGRAM_DISCONNECTED_CONNECTION ||
    account.isActive
  ) {
    return null
  }

  return new Date(account.lastActiveAt.getTime() + INSTAGRAM_RECONNECT_GRACE_MS)
}

export function isInstagramDisconnectError(error: unknown) {
  const metaCode = (error as Error & { metaCode?: number })?.metaCode
  if (metaCode === 190) return true

  const message = error instanceof Error ? error.message.toLowerCase() : ""
  return (
    message.includes("acesso desta conta expirou") ||
    (message.includes("token") && message.includes("expir")) ||
    message.includes("reconecte a conta")
  )
}


export function isInstagramPermanentPublishError(error: unknown) {
  const operationError = error as Error & { metaCode?: number; metaSubcode?: number }
  if (operationError?.metaCode === 190) return true
  if ([10, 200].includes(operationError?.metaCode || -1)) return true
  if (operationError?.metaCode === 25 && operationError?.metaSubcode === 2207050) return true

  const message = error instanceof Error ? error.message.toLowerCase() : ""
  return (
    message.includes("api access deactivated") ||
    message.includes("meta desativou o acesso da api") ||
    message.includes("não aceita publicação pela api") ||
    message.includes("unsupported request - method type: post") ||
    message.includes("unsupported request - method type: get") ||
    message.includes("user access is restricted") ||
    message.includes("instagram account is restricted") ||
    message.includes("acesso desta conta expirou") ||
    (message.includes("token") && message.includes("expir")) ||
    message.includes("reconecte a conta")
  )
}

export async function markInstagramAccountDisconnected(accountId: string) {
  return prisma.instagramAccount.updateMany({
    where: { id: accountId },
    data: {
      connectionType: INSTAGRAM_DISCONNECTED_CONNECTION,
      isActive: false,
      lastActiveAt: new Date(),
    },
  })
}

export async function maintainInstagramAccounts(userId?: string) {
  const now = new Date()
  const cutoff = new Date(now.getTime() - INSTAGRAM_RECONNECT_GRACE_MS)
  const userWhere = userId ? { userId } : {}

  // Só remove contas que já entraram no estado explícito de desconexão.
  // Contas antigas/inativas recebem primeiro uma janela completa de 24 horas.
  const deleted = await prisma.instagramAccount.deleteMany({
    where: {
      ...userWhere,
      connectionType: INSTAGRAM_DISCONNECTED_CONNECTION,
      isActive: false,
      lastActiveAt: { lte: cutoff },
    },
  })

  // Ao detectar uma conta oficial inválida, inicia a janela de reconexão.
  // Enquanto desconectada, lastActiveAt marca o início dessa janela.
  const disconnected = await prisma.instagramAccount.updateMany({
    where: {
      ...userWhere,
      connectionType: INSTAGRAM_OFFICIAL_CONNECTION,
      OR: [
        { isActive: false },
        { accessToken: null },
        { appConfigId: null },
        { tokenExpiresAt: null },
        { tokenExpiresAt: { lte: now } },
      ],
    },
    data: {
      connectionType: INSTAGRAM_DISCONNECTED_CONNECTION,
      isActive: false,
      lastActiveAt: now,
    },
  })

  return {
    deleted: deleted.count,
    disconnected: disconnected.count,
  }
}
