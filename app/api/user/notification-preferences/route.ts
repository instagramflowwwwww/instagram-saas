import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getNotificationPreference } from "@/lib/notification-preferences"

export const runtime = "nodejs"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const preferences = await getNotificationPreference(session.user.id)
  return NextResponse.json({ preferences })
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const current = await getNotificationPreference(session.user.id)

  const massDisconnectEnabled = Boolean(body.massDisconnectEnabled ?? current.massDisconnectEnabled)
  const massDisconnectThreshold = clampInt(
    body.massDisconnectThreshold ?? current.massDisconnectThreshold,
    1,
    1000,
    current.massDisconnectThreshold
  )
  const viralEnabled = Boolean(body.viralEnabled ?? current.viralEnabled)
  const viralViewsThreshold = clampInt(
    body.viralViewsThreshold ?? current.viralViewsThreshold,
    1000,
    50_000_000,
    current.viralViewsThreshold
  )
  const viewsGoalEnabled = Boolean(body.viewsGoalEnabled ?? current.viewsGoalEnabled)
  const dailyViewsGoalRaw = body.dailyViewsGoal === null ? null : body.dailyViewsGoal ?? current.dailyViewsGoal
  const dailyViewsGoal =
    dailyViewsGoalRaw === null || dailyViewsGoalRaw === undefined
      ? null
      : clampInt(dailyViewsGoalRaw, 1, 1_000_000_000, current.dailyViewsGoal || 1000)
  const digestEnabled = Boolean(body.digestEnabled ?? current.digestEnabled)

  await prisma.notificationPreference.upsert({
    where: { userId: session.user.id },
    update: {
      massDisconnectEnabled,
      massDisconnectThreshold,
      viralEnabled,
      viralViewsThreshold,
      viewsGoalEnabled,
      dailyViewsGoal,
      digestEnabled,
    },
    create: {
      userId: session.user.id,
      massDisconnectEnabled,
      massDisconnectThreshold,
      viralEnabled,
      viralViewsThreshold,
      viewsGoalEnabled,
      dailyViewsGoal,
      digestEnabled,
    },
  })

  const preferences = await getNotificationPreference(session.user.id)
  return NextResponse.json({ preferences })
}
