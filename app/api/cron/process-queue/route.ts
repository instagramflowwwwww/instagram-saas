import { NextResponse } from "next/server"
import { processDueQueue } from "@/lib/queue-processor"

export const runtime = "nodejs"
export const maxDuration = 300

function authorized(request: Request) {
  const secret = process.env.QUEUE_CRON_SECRET
  if (!secret) return false
  const authorization = request.headers.get("authorization")
  const headerSecret = request.headers.get("x-cron-secret")
  return authorization === `Bearer ${secret}` || headerSecret === secret
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    const result = await processDueQueue({ limit: 1 })
    return NextResponse.json(result)
  } catch (error) {
    console.error("Cron queue process error", error)
    return NextResponse.json(
      { error: "Não foi possível processar a fila." },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  return POST(request)
}
