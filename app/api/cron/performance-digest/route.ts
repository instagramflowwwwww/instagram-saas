import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isPushConfigured, sendPushToUser } from "@/lib/web-push"

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
    // Soma as visualizações de todas as contas do usuário de uma vez — não
    // dá pra fazer isso com groupBy do Prisma porque o total mora no
    // PostLog e o dono da publicação mora no Post.
    const totals = await prisma.$queryRaw<{ userId: string; totalViews: bigint | null }[]>`
      SELECT p."userId" as "userId", SUM(pl."performanceViewsCount") as "totalViews"
      FROM "PostLog" pl
      JOIN "Post" p ON p.id = pl."postId"
      WHERE pl.status = 'success' AND pl."performanceViewsCount" IS NOT NULL
      GROUP BY p."userId"
    `

    let notified = 0
    for (const row of totals) {
      const totalViews = Number(row.totalViews || 0)
      if (totalViews <= 0) continue

      try {
        const result = await sendPushToUser(row.userId, {
          title: "📊 Performance das suas contas",
          body: `${formatCompactViews(totalViews)} visualizações no total, somando todas as contas.`,
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
