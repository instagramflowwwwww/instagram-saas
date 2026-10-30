import { prisma } from "@/lib/prisma"

export type NotificationPreferenceValues = {
  massDisconnectEnabled: boolean
  massDisconnectThreshold: number
  viralEnabled: boolean
  viralViewsThreshold: number
  viewsGoalEnabled: boolean
  dailyViewsGoal: number | null
  dailyViewsGoalReachedDate: string | null
  digestEnabled: boolean
}

export const NOTIFICATION_DEFAULTS: NotificationPreferenceValues = {
  massDisconnectEnabled: true,
  massDisconnectThreshold: 3,
  viralEnabled: true,
  viralViewsThreshold: 100_000,
  viewsGoalEnabled: false,
  dailyViewsGoal: null,
  dailyViewsGoalReachedDate: null,
  digestEnabled: true,
}

// Usuário sem linha em NotificationPreference ainda usa os valores padrão —
// a linha só é criada quando a pessoa salva algo diferente nas Configurações
// ou quando um alerta precisa registrar estado (ex.: cooldown).
export async function getNotificationPreferencesMap(userIds: string[]) {
  const unique = Array.from(new Set(userIds))
  const rows = unique.length
    ? await prisma.notificationPreference.findMany({ where: { userId: { in: unique } } })
    : []
  const byUser = new Map(rows.map((row) => [row.userId, row]))

  const result = new Map<string, NotificationPreferenceValues>()
  for (const userId of unique) {
    const row = byUser.get(userId)
    result.set(
      userId,
      row
        ? {
            massDisconnectEnabled: row.massDisconnectEnabled,
            massDisconnectThreshold: row.massDisconnectThreshold,
            viralEnabled: row.viralEnabled,
            viralViewsThreshold: row.viralViewsThreshold,
            viewsGoalEnabled: row.viewsGoalEnabled,
            dailyViewsGoal: row.dailyViewsGoal,
            dailyViewsGoalReachedDate: row.dailyViewsGoalReachedDate,
            digestEnabled: row.digestEnabled,
          }
        : { ...NOTIFICATION_DEFAULTS }
    )
  }
  return result
}

export async function getNotificationPreference(userId: string) {
  const map = await getNotificationPreferencesMap([userId])
  return map.get(userId) as NotificationPreferenceValues
}
