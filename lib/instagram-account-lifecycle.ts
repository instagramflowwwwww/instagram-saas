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

// O instante em que uma conta deixou de publicar. Uma conta explicitamente
// desconectada carimba lastActiveAt na hora da queda; uma conta que só teve
// o token vencido não gera esse evento, então a queda é a própria validade.
// Retorna null para uma conta que nunca caiu.
export function accountFellAt(
  account: InstagramAccountState & { lastActiveAt: Date },
  now = Date.now()
): Date | null {
  if (!requiresInstagramReconnect(account)) return null

  if (account.connectionType === INSTAGRAM_DISCONNECTED_CONNECTION) {
    return account.lastActiveAt
  }

  if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() <= now) {
    return account.tokenExpiresAt
  }

  return null
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

const CHRONIC_FAILURE_STREAK = 3

// Cobre publicações que falham com um erro que a Meta devolve num formato
// que os classificadores de cima não reconhecem (mensagem/código novo,
// diferente do que já vimos). Em vez de depender de prever cada texto de
// erro possível, se as últimas N tentativas de publicação de uma conta
// falharam todas seguidas, sem nenhum sucesso no meio, tratamos como
// desconectada — não tem outra explicação plausível pra isso acontecer.
async function flagChronicallyFailingAccounts(userWhere: { userId?: string }) {
  const accounts = await prisma.instagramAccount.findMany({
    where: {
      ...userWhere,
      connectionType: INSTAGRAM_OFFICIAL_CONNECTION,
      isActive: true,
    },
    select: {
      id: true,
      postLogs: {
        orderBy: { createdAt: "desc" },
        take: CHRONIC_FAILURE_STREAK,
        select: { status: true },
      },
    },
  })

  const chronicallyFailing = accounts.filter(
    (account) =>
      account.postLogs.length === CHRONIC_FAILURE_STREAK &&
      account.postLogs.every((log) => log.status === "error")
  )

  await Promise.all(
    chronicallyFailing.map((account) => markInstagramAccountDisconnected(account.id))
  )

  return chronicallyFailing.length
}

export async function maintainInstagramAccounts(userId?: string) {
  const now = new Date()
  const cutoff = new Date(now.getTime() - INSTAGRAM_RECONNECT_GRACE_MS)
  const userWhere = userId ? { userId } : {}

  const chronicallyDisconnected = await flagChronicallyFailingAccounts(userWhere)

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
    chronicallyDisconnected,
    deleted: deleted.count,
    disconnected: disconnected.count,
  }
}
