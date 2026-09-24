import { randomUUID } from "crypto"
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  buildStoryHtml,
  getStorritoConnection,
  LINK_DESIGNS,
  scheduleStory,
  StorritoError,
  type LinkDesign,
} from "@/lib/storrito"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const stories = await prisma.storritoStory.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  })

  return NextResponse.json({ stories })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const instagramUsername = String(body.instagramUsername || "").trim().replace(/^@/, "")
  const mediaUrl = String(body.mediaUrl || "").trim()
  const mediaType = String(body.mediaType || "").toLowerCase() === "video" ? "video" : "image"
  const linkUrl = String(body.linkUrl || "").trim()
  const linkText = String(body.linkText || "").trim().slice(0, 30)
  const design = (LINK_DESIGNS as readonly string[]).includes(String(body.design))
    ? (String(body.design) as LinkDesign)
    : "default"
  const scheduledAt = body.scheduledAt ? new Date(String(body.scheduledAt)) : null

  if (!instagramUsername) {
    return NextResponse.json({ error: "Escolha a conta do Instagram." }, { status: 400 })
  }
  if (!isHttpUrl(mediaUrl)) {
    return NextResponse.json({ error: "Informe a URL pública da mídia." }, { status: 400 })
  }
  if (!isHttpUrl(linkUrl)) {
    return NextResponse.json({ error: "Informe um link válido (https://...)." }, { status: 400 })
  }
  if (!linkText) {
    return NextResponse.json({ error: "Informe o texto do adesivo de link." }, { status: 400 })
  }
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: "Data de agendamento inválida." }, { status: 400 })
  }

  const connection = await getStorritoConnection(session.user.id)
  if (!connection) {
    return NextResponse.json({ error: "Storrito não configurado." }, { status: 400 })
  }

  const storyPostUuid = randomUUID()
  const html = buildStoryHtml({ mediaUrl, mediaType, linkUrl, linkText, design })

  try {
    const result = await scheduleStory(connection, {
      html,
      instagramUsername,
      storyPostUuid,
      ...(scheduledAt ? { date: scheduledAt.toISOString() } : {}),
    })

    const story = await prisma.storritoStory.create({
      data: {
        userId: session.user.id,
        storyPostUuid,
        instagramUsername,
        mediaUrl,
        linkUrl,
        linkText,
        scheduledAt,
        status: result.status || "scheduled",
        warnings: result.warnings?.length ? JSON.stringify(result.warnings) : null,
      },
    })

    return NextResponse.json({ story }, { status: 201 })
  } catch (error) {
    const status = error instanceof StorritoError ? 502 : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao agendar o story." },
      { status }
    )
  }
}
