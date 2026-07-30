import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type CaptionEntry = {
  mediaId?: string
  caption?: string
  hashtags?: string
}

const CAPTION_MODES = new Set(["single", "per_media", "rotate"])

function cleanText(value: unknown, max = 2200) {
  return String(value || "").trim().slice(0, max)
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const batches = await prisma.postingBatch.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      accounts: {
        include: {
          instagramAccount: {
            select: {
              id: true,
              username: true,
              profilePicture: true,
              isActive: true,
            },
          },
        },
      },
      items: {
        orderBy: { position: "asc" },
        include: {
          media: {
            select: {
              id: true,
              url: true,
              type: true,
              fileName: true,
            },
          },
          post: {
            select: {
              id: true,
              status: true,
              publishedAt: true,
            },
          },
        },
      },
    },
  })

  return NextResponse.json({
    batches,
    generatedAt: new Date().toISOString(),
    executorConfigured: Boolean(process.env.QUEUE_CRON_SECRET),
  })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const mediaIds: string[] = Array.isArray(body.mediaIds)
      ? Array.from(
          new Set(body.mediaIds.map((mediaId: unknown) => String(mediaId)))
        ).slice(0, 50)
      : []
    const accountIds: string[] = Array.isArray(body.accountIds)
      ? Array.from(
          new Set(body.accountIds.map((accountId: unknown) => String(accountId)))
        ).slice(0, 20)
      : []
    const captionMode = String(body.captionMode || "single")
    const intervalMinutes = Number(body.intervalMinutes)
    const startAt = new Date(String(body.startAt || ""))
    const name = cleanText(body.name, 120) || null

    if (mediaIds.length === 0) {
      return NextResponse.json(
        { error: "Selecione pelo menos uma mídia da biblioteca." },
        { status: 400 }
      )
    }
    if (accountIds.length === 0) {
      return NextResponse.json(
        { error: "Selecione pelo menos uma conta." },
        { status: 400 }
      )
    }
    if (!CAPTION_MODES.has(captionMode)) {
      return NextResponse.json({ error: "Modo de legenda inválido." }, { status: 400 })
    }
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 5 || intervalMinutes > 1440) {
      return NextResponse.json(
        { error: "O intervalo precisa estar entre 5 minutos e 24 horas." },
        { status: 400 }
      )
    }
    if (Number.isNaN(startAt.getTime())) {
      return NextResponse.json({ error: "Data inicial inválida." }, { status: 400 })
    }
    if (startAt.getTime() < Date.now() - 2 * 60 * 1000) {
      return NextResponse.json(
        { error: "A primeira publicação não pode estar no passado." },
        { status: 400 }
      )
    }
    if (startAt.getTime() > Date.now() + 180 * 24 * 60 * 60 * 1000) {
      return NextResponse.json(
        { error: "A automação pode começar em até 180 dias." },
        { status: 400 }
      )
    }

    const [mediaRecords, accounts] = await Promise.all([
      prisma.mediaLibrary.findMany({
        where: { id: { in: mediaIds }, userId: session.user.id },
      }),
      prisma.instagramAccount.findMany({
        where: {
          id: { in: accountIds },
          userId: session.user.id,
          isActive: true,
          connectionType: "official",
          appConfigId: { not: null },
        },
        select: { id: true },
      }),
    ])

    if (mediaRecords.length !== mediaIds.length) {
      return NextResponse.json(
        { error: "Uma ou mais mídias não foram encontradas na sua biblioteca." },
        { status: 400 }
      )
    }
    if (accounts.length !== accountIds.length) {
      return NextResponse.json(
        { error: "Uma ou mais contas precisam ser reconectadas pelo App Meta." },
        { status: 400 }
      )
    }

    const mediaMap = new Map(mediaRecords.map((media) => [media.id, media]))
    const itemCaptions = Array.isArray(body.itemCaptions)
      ? (body.itemCaptions as CaptionEntry[])
      : []
    const itemCaptionMap = new Map(
      itemCaptions.map((entry) => [String(entry.mediaId || ""), entry])
    )
    const rotationCaptions = Array.isArray(body.rotationCaptions)
      ? (body.rotationCaptions as CaptionEntry[]).filter(
          (entry) => cleanText(entry.caption) || cleanText(entry.hashtags, 500)
        )
      : []
    const singleCaption = cleanText(body.singleCaption)
    const singleHashtags = cleanText(body.singleHashtags, 500)

    if (captionMode === "rotate" && rotationCaptions.length === 0) {
      return NextResponse.json(
        { error: "Adicione pelo menos uma legenda para alternar." },
        { status: 400 }
      )
    }

    const getCaption = (mediaId: string, index: number) => {
      if (captionMode === "per_media") {
        const entry = itemCaptionMap.get(mediaId)
        return {
          caption: cleanText(entry?.caption),
          hashtags: cleanText(entry?.hashtags, 500),
        }
      }
      if (captionMode === "rotate") {
        const entry = rotationCaptions[index % rotationCaptions.length]
        return {
          caption: cleanText(entry?.caption),
          hashtags: cleanText(entry?.hashtags, 500),
        }
      }
      return { caption: singleCaption, hashtags: singleHashtags }
    }

    const batch = await prisma.$transaction(async (tx) => {
      const createdBatch = await tx.postingBatch.create({
        data: {
          userId: session.user.id,
          name,
          captionMode,
          intervalMinutes,
          startAt,
          totalItems: mediaIds.length,
          accounts: {
            create: accounts.map((account) => ({
              instagramAccountId: account.id,
            })),
          },
        },
      })

      for (let index = 0; index < mediaIds.length; index += 1) {
        const mediaId = mediaIds[index]
        const media = mediaMap.get(mediaId)
        if (!media) throw new Error("Mídia não encontrada durante o agendamento.")
        const scheduledAt = new Date(
          startAt.getTime() + index * intervalMinutes * 60 * 1000
        )
        const text = getCaption(mediaId, index)
        const post = await tx.post.create({
          data: {
            userId: session.user.id,
            imageUrl: media.type === "image" ? media.url : null,
            videoUrl: media.type === "video" ? media.url : null,
            caption: text.caption,
            hashtags: text.hashtags,
            status: "scheduled",
            scheduledAt,
          },
        })

        await tx.postingBatchItem.create({
          data: {
            batchId: createdBatch.id,
            mediaId: media.id,
            postId: post.id,
            position: index,
            caption: text.caption,
            hashtags: text.hashtags,
            scheduledAt,
          },
        })
      }

      return createdBatch
    })

    return NextResponse.json({ batch }, { status: 201 })
  } catch (error) {
    console.error("Create posting batch error", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível criar a automação.",
      },
      { status: 500 }
    )
  }
}
