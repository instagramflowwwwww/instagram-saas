import { NextResponse } from "next/server"
import { processDueQueue } from "@/lib/queue-processor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

const DEFAULT_PARALLEL_USERS = 3
const MAX_PARALLEL_USERS = 4

function authorized(request: Request) {
  const secrets = [
    process.env.CRON_SECRET?.trim(),
    process.env.QUEUE_CRON_SECRET?.trim(),
  ].filter((value): value is string => Boolean(value))

  if (secrets.length === 0) return false

  const authorization = request.headers.get("authorization")?.trim()
  const headerSecret = request.headers.get("x-cron-secret")?.trim()

  return secrets.some(
    (secret) => authorization === `Bearer ${secret}` || headerSecret === secret
  )
}

function parallelUsersPerRun() {
  const configured = Number(process.env.QUEUE_PARALLEL_USERS)
  if (Number.isInteger(configured) && configured >= 1) {
    return Math.min(configured, MAX_PARALLEL_USERS)
  }
  return DEFAULT_PARALLEL_USERS
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    console.warn("[queue-cron] Unauthorized request")
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const startedAt = Date.now()
  const parallelUsers = parallelUsersPerRun()

  try {
    const result = await processDueQueue({ limit: parallelUsers })
    const response = {
      ...result,
      executor: "cron",
      parallelUsers,
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
      {
        error: message,
        executor: "cron",
        parallelUsers,
        durationMs: Date.now() - startedAt,
      },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    )
  }
}

export async function GET(request: Request) {
  return POST(request)
}
