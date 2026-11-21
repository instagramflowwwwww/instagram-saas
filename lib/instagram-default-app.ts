import { prisma } from "@/lib/prisma"
import { encryptValue } from "@/lib/secure-store"

// App Meta único, já em modo Live, usado como padrão pra qualquer usuário
// que ainda não tenha configurado o próprio — elimina a necessidade de
// convite de testador pra quem usa esse app. As credenciais ficam só em
// variável de ambiente (nunca repetidas em texto puro no banco).
export function getDefaultInstagramAppCredentials() {
  const metaAppId = process.env.INSTAGRAM_DEFAULT_APP_ID?.trim()
  const appSecret = process.env.INSTAGRAM_DEFAULT_APP_SECRET?.trim()

  if (!metaAppId || !appSecret) return null
  return { metaAppId, appSecret }
}

// Identifica a linha do App Padrão pelo nome reservado, não pelo metaAppId
// — assim, quando a credencial na variável de ambiente troca (ex.: app
// republicado), a mesma linha é atualizada em vez de virar uma segunda
// linha órfã. Nunca toca em apps que o próprio usuário cadastrou com outro
// nome — só mexe na linha "App Padrão".
export async function ensureDefaultInstagramApp(userId: string) {
  const credentials = getDefaultInstagramAppCredentials()
  if (!credentials) return null

  // Admin bloqueou esse usuário de usar o App Padrão (painel admin, aba
  // Usuários e Acessos) — não cria nem atualiza a linha pra ele. Contas que
  // ele já tinha conectado com o App Padrão antes do bloqueio continuam
  // intactas, só não dá pra conectar NOVAS contas com ele.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultAppBlocked: true },
  })
  if (user?.defaultAppBlocked) return null

  const existing = await prisma.instagramApp.findFirst({
    where: { userId, name: "App Padrão" },
    select: { id: true, metaAppId: true },
  })

  if (existing) {
    if (existing.metaAppId !== credentials.metaAppId) {
      await prisma.instagramApp.update({
        where: { id: existing.id },
        data: {
          metaAppId: credentials.metaAppId,
          appSecretEncrypted: encryptValue(credentials.appSecret),
        },
      })
    }
    return existing.id
  }

  const created = await prisma.instagramApp.create({
    data: {
      userId,
      metaAppId: credentials.metaAppId,
      name: "App Padrão",
      appSecretEncrypted: encryptValue(credentials.appSecret),
    },
    select: { id: true },
  })

  return created.id
}

// Escolhe automaticamente qual App Meta usar quando quem está conectando não
// especificou um — o de menos contas, pra distribuir sozinho entre vários
// Apps Meta. Garante o App Padrão primeiro se o usuário ainda não tiver
// nenhum app próprio configurado. Compartilhado entre o fluxo normal do
// dashboard (/api/instagram/oauth/start) e o link de conexão rápida
// (/api/instagram/quick-connect).
export async function pickAppIdForUser(userId: string): Promise<string | null> {
  let apps = await prisma.instagramApp.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, _count: { select: { accounts: true } } },
  })

  if (apps.length === 0) {
    const defaultAppId = await ensureDefaultInstagramApp(userId)
    if (defaultAppId) {
      apps = await prisma.instagramApp.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: { id: true, _count: { select: { accounts: true } } },
      })
    }
  }

  if (apps.length === 0) return null
  return [...apps].sort((a, b) => a._count.accounts - b._count.accounts)[0].id
}

// Usado pelo painel admin ao bloquear o App Padrão de alguém: apaga a linha
// "App Padrão" desse usuário SÓ se nenhuma conta do Instagram estiver usando
// ela — nunca derruba conta já conectada e publicando. Se tiver conta usando,
// a linha fica (pra não quebrar a publicação), mas o bloqueio em si (ver
// ensureDefaultInstagramApp) já impede qualquer conexão NOVA por ele.
export async function removeDefaultInstagramAppIfUnused(userId: string) {
  const app = await prisma.instagramApp.findFirst({
    where: { userId, name: "App Padrão" },
    select: { id: true, _count: { select: { accounts: true } } },
  })

  if (!app) return { removed: false, accountsUsingIt: 0 }
  if (app._count.accounts > 0) {
    return { removed: false, accountsUsingIt: app._count.accounts }
  }

  await prisma.instagramApp.delete({ where: { id: app.id } })
  return { removed: true, accountsUsingIt: 0 }
}
