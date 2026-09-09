import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function cleanText(value: unknown, max = 2200) {
  return String(value ?? "").trim().slice(0, max) || null
}

// Só a legenda/hashtags de um item — a ideia é essa mídia carregar seu
// próprio texto pra sempre, em vez de precisar redigitar em cada automação.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const media = await prisma.mediaLibrary.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: { id: true },
  })
  if (!media) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const updated = await prisma.mediaLibrary.update({
    where: { id: media.id },
    data: {
      caption: cleanText(body.caption),
      hashtags: cleanText(body.hashtags, 500),
    },
  })

  return NextResponse.json(updated)
}
