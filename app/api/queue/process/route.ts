import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { processDueQueue } from "@/lib/queue-processor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const startedAt = Date.now()

  try {
    const result = await processDueQueue({ userId: session.user.id, limit: 1 })
    return NextResponse.json(
      {
        ...result,
        executor: "dashboard",
        durationMs: Date.now() - startedAt,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Não foi possível processar a fila agora."

    console.error("[queue-dashboard] Manual queue process error", error)

    return NextResponse.json(
      { error: message, executor: "dashboard", durationMs: Date.now() - startedAt },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    )
  }
}
