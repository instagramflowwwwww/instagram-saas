import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { generateCaptionFromFrames } from "@/lib/caption-ai"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_FRAMES = 6
// ~1.5 MB por frame já em base64: sobra folga para um JPEG de 720p.
const MAX_FRAME_CHARS = 2_000_000

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "A chave da IA não está configurada no servidor." },
      { status: 503 }
    )
  }

  const body = await request.json().catch(() => ({}))

  const frames: string[] = Array.isArray(body.frames)
    ? body.frames
        .map((frame: unknown) => String(frame || "").replace(/^data:image\/\w+;base64,/, ""))
        .filter(Boolean)
        .slice(0, MAX_FRAMES)
    : []

  if (frames.length === 0) {
    return NextResponse.json(
      { error: "Não foi possível ler os frames do vídeo." },
      { status: 400 }
    )
  }
  if (frames.some((frame) => frame.length > MAX_FRAME_CHARS)) {
    return NextResponse.json(
      { error: "Os frames vieram grandes demais. Tente outro vídeo." },
      { status: 400 }
    )
  }

  const context = typeof body.context === "string" ? body.context.slice(0, 500) : ""

  try {
    const result = await generateCaptionFromFrames({ frames, context })
    return NextResponse.json(result)
  } catch (error) {
    console.error("[ai-caption] falhou", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível gerar a legenda agora.",
      },
      { status: 502 }
    )
  }
}
