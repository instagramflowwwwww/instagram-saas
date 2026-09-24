import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cancelStory, getStorritoConnection, getStoryStatus, StorritoError } from "@/lib/storrito"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function loadOwned(uuid: string, userId: string) {
  return prisma.storritoStory.findFirst({ where: { storyPostUuid: uuid, userId } })
}

// GET = atualizar o status consultando o Storrito
export async function GET(_request: Request, { params }: { params: { uuid: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const story = await loadOwned(params.uuid, session.user.id)
  if (!story) return NextResponse.json({ error: "Story não encontrado." }, { status: 404 })

  const connection = await getStorritoConnection(session.user.id)
  if (!connection) return NextResponse.json({ error: "Storrito não configurado." }, { status: 400 })

  try {
    const result = await getStoryStatus(connection, story.storyPostUuid)
    const updated = await prisma.storritoStory.update({
      where: { id: story.id },
      data: { status: result.status },
    })
    return NextResponse.json({ story: updated })
  } catch (error) {
    const status = error instanceof StorritoError ? 502 : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao consultar o status." },
      { status }
    )
  }
}

// DELETE = cancelar um story ainda agendado
export async function DELETE(_request: Request, { params }: { params: { uuid: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const story = await loadOwned(params.uuid, session.user.id)
  if (!story) return NextResponse.json({ error: "Story não encontrado." }, { status: 404 })

  const connection = await getStorritoConnection(session.user.id)
  if (!connection) return NextResponse.json({ error: "Storrito não configurado." }, { status: 400 })

  try {
    const result = await cancelStory(connection, story.storyPostUuid)
    const updated = await prisma.storritoStory.update({
      where: { id: story.id },
      data: { status: result.status },
    })
    return NextResponse.json({ story: updated })
  } catch (error) {
    const status = error instanceof StorritoError ? 502 : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao cancelar o story." },
      { status }
    )
  }
}
