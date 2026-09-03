import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { isPushConfigured, sendPushToUser } from "@/lib/web-push"

export const runtime = "nodejs"

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: "As notificações push não estão configuradas no servidor." },
      { status: 503 }
    )
  }

  try {
    const result = await sendPushToUser(session.user.id, {
      title: "InstaFlow",
      body: "Notificações ativadas. Você vai ser avisado quando um vídeo bombar.",
      tag: "test",
    })

    if (result.sent === 0) {
      return NextResponse.json(
        { error: "Nenhum aparelho inscrito. Ative as notificações primeiro." },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível enviar o teste." },
      { status: 500 }
    )
  }
}
