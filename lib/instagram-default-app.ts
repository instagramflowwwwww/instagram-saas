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

// Idempotente: só cria a linha se este usuário ainda não tiver um app com
// esse mesmo metaAppId. Nunca toca em apps já cadastrados pelo usuário —
// é puramente aditivo, pra não arriscar nenhuma conta já conectada em
// outro app.
export async function ensureDefaultInstagramApp(userId: string) {
  const credentials = getDefaultInstagramAppCredentials()
  if (!credentials) return null

  const existing = await prisma.instagramApp.findFirst({
    where: { userId, metaAppId: credentials.metaAppId },
    select: { id: true },
  })
  if (existing) return existing.id

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
