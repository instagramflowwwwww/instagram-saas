import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isPushConfigured, sendPushToUser } from "@/lib/web-push"
import { getNotificationPreferencesMap } from "@/lib/notification-preferences"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function authorized(request: Request) {
  const secret = process.env.QUEUE_CRON_SECRET?.trim()
  if (!secret) return false

  const authorization = request.headers.get("authorization")?.trim()
  const headerSecret = request.headers.get("x-cron-secret")?.trim()

  return authorization === `Bearer ${secret}` || headerSecret === secret
}

// "1M", "234mil" etc — igual ao jeito que o usuário fala, em vez do número
// cheio com pontos.
function formatCompactViews(value: number) {
  const format = (amount: number, suffix: string) => {
    const rounded = Math.round(amount * 10) / 10
    const text = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(".", ",")
    return `${text}${suffix}`
  }

  if (value >= 1_000_000) return format(value / 1_000_000, "M")
  if (value >= 1_000) return format(value / 1_000, "mil")
  return String(value)
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    console.warn("[performance-digest] Unauthorized request")
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const startedAt = Date.now()

  if (!isPushConfigured()) {
    return NextResponse.json(
      { skipped: "push not configured", durationMs: Date.now() - startedAt },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    )
  }

  try {
    // "Hoje" em horário de Brasília (UTC-3, fixo — sem horário de verão).
    // 00h em Brasília é 03h UTC, então dá pra calcular sem depender do
    // fuso horário de onde a function roda.
    const now = new Date()
    const brtNow = new Date(now.getTime() - 3 * 60 * 60 * 1000)
    const todayStartUtc = new Date(
      Date.UTC(brtNow.getUTCFullYear(), brtNow.getUTCMonth(), brtNow.getUTCDate(), 3, 0, 0, 0)
    )
    const tomorrowStartUtc = new Date(todayStartUtc.getTime() + 24 * 60 * 60 * 1000)

    // Soma as visualizações de hoje de todas as contas do usuário de uma vez
    // — não dá pra fazer isso com groupBy do Prisma porque o total mora no
    // PostLog e o dono da publicação mora no Post. Mesmo critério de "Hoje"
    // já usado na tela de Performance: post (não story), log de sucesso,
    // criado dentro do dia de hoje.
    const totals = await prisma.$queryRaw<{ userId: string; totalViews: bigint | null }[]>`
      SELECT p."userId" as "userId", SUM(pl."performanceViewsCount") as "totalViews"
      FROM "PostLog" pl
      JOIN "Post" p ON p.id = pl."postId"
      WHERE pl.status = 'success'
        AND pl."mediaId" IS NOT NULL
        AND pl."performanceViewsCount" IS NOT NULL
        AND p."publicationType" = 'post'
        AND pl."createdAt" >= ${todayStartUtc}
        AND pl."createdAt" < ${tomorrowStartUtc}
      GROUP BY p."userId"
    `

    const todayDateString = `${brtNow.getUTCFullYear()}-${String(brtNow.getUTCMonth() + 1).padStart(2, "0")}-${String(brtNow.getUTCDate()).padStart(2, "0")}`

    const prefs = await getNotificationPreferencesMap(totals.map((row) => row.userId))

    let notified = 0
    let goalsReached = 0
    for (const row of totals) {
      const totalViews = Number(row.totalViews || 0)
      if (totalViews <= 0) continue
      const pref = prefs.get(row.userId)

      if (
        pref?.viewsGoalEnabled &&
        pref.dailyViewsGoal &&
        totalViews >= pref.dailyViewsGoal &&
        pref.dailyViewsGoalReachedDate !== todayDateString
      ) {
        try {
          await sendPushToUser(row.userId, {
            title: "🎯 Meta de views batida!",
            body: `Você passou de ${formatCompactViews(pref.dailyViewsGoal)} visualizações hoje (${formatCompactViews(totalViews)}).`,
            url: "/dashboard/performance",
            tag: "views-goal",
          })
          goalsReached += 1
        } catch (error) {
          console.error("[performance-digest] Falha ao enviar push de meta", { userId: row.userId, error })
        }

        await prisma.notificationPreference.upsert({
          where: { userId: row.userId },
          update: { dailyViewsGoalReachedDate: todayDateString },
          create: { userId: row.userId, dailyViewsGoalReachedDate: todayDateString },
        })
      }

      if (pref && !pref.digestEnabled) continue

      try {
        const result = await sendPushToUser(row.userId, {
          title: "📊 Performance de hoje",
          body: `${formatCompactViews(totalViews)} visualizações hoje, somando todas as contas.`,
          url: "/dashboard/performance",
          tag: "performance-digest",
        })
        if (result.sent > 0) notified += 1
      } catch (error) {
        console.error("[performance-digest] Falha ao enviar push", { userId: row.userId, error })
      }
    }

    const response = {
      users: totals.length,
      notified,
      goalsReached,
      durationMs: Date.now() - startedAt,
    }

    console.info("[performance-digest] Resumo enviado", response)

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Não foi possível montar o resumo de performance."

    console.error("[performance-digest] Falhou", error)

    return NextResponse.json(
      { error: message, durationMs: Date.now() - startedAt },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    )
  }
}

export async function GET(request: Request) {
  return POST(request)
}
