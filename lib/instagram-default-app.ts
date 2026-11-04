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
