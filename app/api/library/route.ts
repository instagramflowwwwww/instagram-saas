import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import {
  deleteR2Object,
  getR2ObjectKeyFromUrl,
  getR2PublicUrl,
  headR2Object,
  isR2DeliveryUrl,
  isR2ObjectOwnedByUser,
} from "@/lib/r2"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const IMAGE_LIMIT = 8 * 1024 * 1024
const VIDEO_LIMIT = 200 * 1024 * 1024

function toOptionalNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function toOptionalInteger(value: unknown) {
  const parsed = toOptionalNumber(value)
  return parsed === null ? null : Math.round(parsed)
}

function getFormat(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30) || null
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
    const objectKey = String(body.objectKey || "").trim()
    const type = String(body.type || "").toLowerCase()
    const fileName = String(body.fileName || "").trim().slice(0, 255)

    if (!objectKey || !isR2ObjectOwnedByUser(objectKey, session.user.id)) {
      return NextResponse.json(
        { error: "O arquivo enviado não pertence a este usuário." },
        { status: 400 }
      )
    }

    if (!fileName || !["image", "video"].includes(type)) {
      return NextResponse.json(
        { error: "Os dados do upload estão incompletos." },
        { status: 400 }
      )
    }

    const requestedFolderId = body.folderId ? String(body.folderId).trim() : null
    let folderId: string | null = null
    if (requestedFolderId) {
      const folder = await prisma.mediaFolder.findFirst({
        where: { id: requestedFolderId, userId: session.user.id },
        select: { id: true },
      })
      if (!folder) {
        await deleteR2Object(objectKey).catch(() => undefined)
        return NextResponse.json({ error: "A pasta selecionada não existe mais." }, { status: 404 })
      }
      folderId = folder.id
    }

    const storedObject = await headR2Object(objectKey)
    const expectedContentTypes =
      type === "image"
        ? ["image/jpeg"]
        : ["video/mp4", "video/quicktime"]
    const maxSize = type === "image" ? IMAGE_LIMIT : VIDEO_LIMIT

    if (
      !expectedContentTypes.includes(storedObject.contentType.toLowerCase()) ||
      storedObject.contentLength <= 0 ||
      storedObject.contentLength > maxSize
    ) {
      await deleteR2Object(objectKey).catch(() => undefined)
      return NextResponse.json(
        { error: "O arquivo armazenado não passou pela validação." },
        { status: 400 }
      )
    }

    const media = await prisma.mediaLibrary.create({
      data: {
        userId: session.user.id,
        folderId,
        url: getR2PublicUrl(objectKey),
        type,
        fileName,
        publicId: objectKey,
        resourceType: type,
        bytes: storedObject.contentLength,
        width: toOptionalInteger(body.width),
        height: toOptionalInteger(body.height),
        duration: toOptionalNumber(body.duration),
        format: getFormat(fileName),
      },
    })

    return NextResponse.json(media, { status: 201 })
  } catch (error) {
    console.error("Library create error", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar o arquivo na biblioteca.",
      },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const ids = Array.from(
      new Set<string>(
        Array.isArray(body.ids)
          ? body.ids.map((id: unknown) => String(id).trim()).filter(Boolean)
          : []
      )
    ).slice(0, 500)
    const folderId = body.folderId ? String(body.folderId).trim() : null

    if (ids.length === 0) {
      return NextResponse.json({ error: "Selecione pelo menos um arquivo." }, { status: 400 })
    }

    if (folderId) {
      const folder = await prisma.mediaFolder.findFirst({
        where: { id: folderId, userId: session.user.id },
        select: { id: true },
      })
      if (!folder) {
        return NextResponse.json({ error: "Pasta não encontrada." }, { status: 404 })
      }
    }

    const result = await prisma.mediaLibrary.updateMany({
      where: { id: { in: ids }, userId: session.user.id },
      data: { folderId },
    })

    return NextResponse.json({ success: true, moved: result.count })
  } catch (error) {
    console.error("Library move error", error)
    return NextResponse.json({ error: "Não foi possível mover os arquivos." }, { status: 500 })
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
        url: true,
        publicId: true,
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
      if (isR2DeliveryUrl(item.url)) {
        const objectKey = item.publicId || getR2ObjectKeyFromUrl(item.url)
        if (
          objectKey &&
          isR2ObjectOwnedByUser(objectKey, session.user.id)
        ) {
          await deleteR2Object(objectKey)
        }
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
