import webpush from "web-push"
import { prisma } from "@/lib/prisma"

const publicKey = process.env.VAPID_PUBLIC_KEY
const privateKey = process.env.VAPID_PRIVATE_KEY
const subject = process.env.VAPID_SUBJECT || "mailto:suporte@instaflow.app"

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey)
}

export function isPushConfigured() {
  return Boolean(publicKey && privateKey)
}

export type PushPayload = {
  title: string
  body: string
  url?: string
  tag?: string
}

// Manda para todas as inscrições do usuário (pode ter mais de um
// aparelho/navegador). Uma inscrição que o navegador já descartou volta
// 404/410 — nesses casos apagamos a linha em vez de tentar de novo depois.
export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!isPushConfigured()) {
    throw new Error("VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas.")
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  })

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 }
  }

  const body = JSON.stringify(payload)
  let sent = 0
  let failed = 0

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body
        )
        sent += 1
      } catch (error) {
        failed += 1
        const statusCode = (error as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => {})
        }
      }
    })
  )

  return { sent, failed }
}
