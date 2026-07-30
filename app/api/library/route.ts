import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import {
  destroyCloudinaryAsset,
  isCloudinaryDeliveryUrl,
  type CloudinaryResourceType,
} from "@/lib/cloudinary"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function toOptionalNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function toOptionalInteger(value: unknown) {
  const parsed = toOptionalNumber(value)
  return parsed === null ? null : Math.round(parsed)
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const media = await prisma.mediaLibrary.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(media)
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const url = String(body.url || "").trim()
    const type = String(body.type || "").toLowerCase()
    const fileName = String(body.fileName || "").trim().slice(0, 255)
    const publicId = String(body.publicId || "").trim()
    const resourceType = String(body.resourceType || type).toLowerCase()

    if (!isCloudinaryDeliveryUrl(url)) {
      return NextResponse.json(
        { error: "O arquivo precisa ter sido enviado ao Cloudinary." },
        { status: 400 }
      )
    }

    if (!["image", "video"].includes(type)) {
      return NextResponse.json(
        { error: "Tipo de mídia inválido." },
        { status: 400 }
      )
    }

    if (!fileName || !publicId || !["image", "video"].includes(resourceType)) {
      return NextResponse.json(
        { error: "Os dados do upload estão incompletos." },
        { status: 400 }
      )
    }

    const media = await prisma.mediaLibrary.create({
      data: {
        userId: session.user.id,
        url,
        type,
        fileName,
        publicId,
        resourceType,
        bytes: toOptionalInteger(body.bytes),
        width: toOptionalInteger(body.width),
        height: toOptionalInteger(body.height),
        duration: toOptionalNumber(body.duration),
        format: body.format ? String(body.format).slice(0, 30) : null,
      },
    })

    return NextResponse.json(media, { status: 201 })
  } catch (error) {
    console.error("Library create error", error)
    return NextResponse.json(
      { error: "Não foi possível salvar o arquivo na biblioteca." },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const requestedIds: string[] = Array.isArray(body.ids)
      ? body.ids.map((id: unknown) => String(id))
      : body.id
        ? [String(body.id)]
        : []
    const ids = Array.from(new Set<string>(requestedIds)).slice(0, 100)

    if (ids.length === 0) {
      return NextResponse.json(
        { error: "Selecione pelo menos um arquivo." },
        { status: 400 }
      )
    }

    const media = await prisma.mediaLibrary.findMany({
      where: { id: { in: ids }, userId: session.user.id },
      select: {
        id: true,
        publicId: true,
        resourceType: true,
        type: true,
        batchItems: {
          where: { status: { in: ["pending", "processing"] } },
          select: { id: true },
          take: 1,
        },
      },
    })

    const inUse = media.filter((item) => item.batchItems.length > 0)
    if (inUse.length > 0) {
      return NextResponse.json(
        {
          error:
            "Um ou mais arquivos estão em uma automação ativa. Cancele a sequência antes de apagar.",
          blockedIds: inUse.map((item) => item.id),
        },
        { status: 409 }
      )
    }

    for (const item of media) {
      if (item.publicId) {
        await destroyCloudinaryAsset({
          publicId: item.publicId,
          resourceType: (item.resourceType || item.type) as CloudinaryResourceType,
        })
      }
    }

    await prisma.mediaLibrary.deleteMany({
      where: { id: { in: media.map((item) => item.id) }, userId: session.user.id },
    })

    return NextResponse.json({ success: true, deleted: media.length })
  } catch (error) {
    console.error("Library delete error", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível apagar o arquivo.",
      },
      { status: 500 }
    )
  }
}
