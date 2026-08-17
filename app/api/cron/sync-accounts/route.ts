import { NextResponse } from "next/server"
import { syncInstagramAccountProfiles } from "@/lib/instagram-account-sync"

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
    console.warn("[account-sync-cron] Unauthorized request")
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const startedAt = Date.now()

  try {
    const result = await syncInstagramAccountProfiles({
      staleMinutes: 15,
      limit: 40,
      concurrency: 4,
    })

    const response = {
      selected: result.selected,
      synced: result.synced,
      failed: result.failed,
      disconnected: result.disconnected,
      durationMs: Date.now() - startedAt,
    }

    console.info("[account-sync-cron] Account profiles synchronized", response)

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível sincronizar as contas."

    console.error("[account-sync-cron] Account sync failed", error)

    return NextResponse.json(
      { error: message, durationMs: Date.now() - startedAt },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    )
  }
}

export async function GET(request: Request) {
  return POST(request)
}
