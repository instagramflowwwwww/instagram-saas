import { NextResponse } from "next/server"
import { processDueQueue } from "@/lib/queue-processor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

function authorized(request: Request) {
  const secret = process.env.QUEUE_CRON_SECRET?.trim()
  if (!secret) return false

  const authorization = request.headers.get("authorization")?.trim()
  const headerSecret = request.headers.get("x-cron-secret")?.trim()

  return authorization === `Bearer ${secret}` || headerSecret === secret
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    console.warn("[queue-cron] Unauthorized request")
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const startedAt = Date.now()

  try {
    const result = await processDueQueue({ limit: 1 })
    const response = {
      ...result,
      executor: "cron",
      durationMs: Date.now() - startedAt,
    }

    console.info("[queue-cron] Queue processed", response)

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Não foi possível processar a fila."

    console.error("[queue-cron] Queue processing failed", error)

    return NextResponse.json(
      { error: message, executor: "cron", durationMs: Date.now() - startedAt },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    )
  }
}

export async function GET(request: Request) {
  return POST(request)
}
