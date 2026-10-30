import { prisma } from "@/lib/prisma"
import { isPushConfigured, sendPushToUser } from "@/lib/web-push"
import { INSTAGRAM_DISCONNECTED_CONNECTION } from "@/lib/instagram-account-lifecycle"
import { getNotificationPreferencesMap } from "@/lib/notification-preferences"

const MASS_DISCONNECT_WINDOW_MINUTES = 30
// Evita reenviar o mesmo alerta a cada execução do cron enquanto a onda de
// quedas continua — um aviso por hora é suficiente pra pessoa agir.
const MASS_DISCONNECT_COOLDOWN_MS = 60 * 60 * 1000

export async function checkMassDisconnections() {
  if (!isPushConfigured()) return { checked: 0, notified: 0 }

  const since = new Date(Date.now() - MASS_DISCONNECT_WINDOW_MINUTES * 60 * 1000)

  const rows = await prisma.instagramAccount.groupBy({
    by: ["userId"],
    where: {
      connectionType: INSTAGRAM_DISCONNECTED_CONNECTION,
      lastActiveAt: { gte: since },
    },
    _count: { _all: true },
  })

  if (rows.length === 0) return { checked: 0, notified: 0 }

  const userIds = rows.map((row) => row.userId)
  const prefs = await getNotificationPreferencesMap(userIds)
  const existing = await prisma.notificationPreference.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, lastMassDisconnectAlertAt: true },
  })
  const lastAlertByUser = new Map(existing.map((row) => [row.userId, row.lastMassDisconnectAlertAt]))

  let notified = 0

  for (const row of rows) {
    const pref = prefs.get(row.userId)
    if (!pref || !pref.massDisconnectEnabled) continue
    if (row._count._all < pref.massDisconnectThreshold) continue

    const lastAlert = lastAlertByUser.get(row.userId)
    if (lastAlert && Date.now() - lastAlert.getTime() < MASS_DISCONNECT_COOLDOWN_MS) continue

    try {
      await sendPushToUser(row.userId, {
        title: "⚠️ Várias contas caíram",
        body: `${row._count._all} contas desconectaram nos últimos ${MASS_DISCONNECT_WINDOW_MINUTES} minutos. Confira a página Contas.`,
        url: "/dashboard/accounts",
        tag: "mass-disconnect",
      })
      notified += 1
    } catch (error) {
      console.error("[mass-disconnect-alert] Falha ao enviar push", { userId: row.userId, error })
    }

    await prisma.notificationPreference.upsert({
      where: { userId: row.userId },
      update: { lastMassDisconnectAlertAt: new Date() },
      create: { userId: row.userId, lastMassDisconnectAlertAt: new Date() },
    })
  }

  return { checked: rows.length, notified }
}
