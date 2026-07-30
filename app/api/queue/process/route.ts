import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { processDueQueue } from "@/lib/queue-processor"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    const result = await processDueQueue({ userId: session.user.id, limit: 1 })
    return NextResponse.json(result)
  } catch (error) {
    console.error("Manual queue process error", error)
    return NextResponse.json(
      { error: "Não foi possível processar a fila agora." },
      { status: 500 }
    )
  }
}
