import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { maintainInstagramAccounts } from "@/lib/instagram-account-lifecycle"
import { isMediaDeliveryUrl } from "@/lib/media-storage"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const maxDuration = 60
export const dynamic = "force-dynamic"

type CaptionEntry = {
  mediaId?: string
  caption?: string
  hashtags?: string
}

type CoverEntry = {
  mediaId?: string
  coverUrl?: string
}

const CAPTION_MODES = new Set(["single", "per_media", "rotate"])
const MAX_ASSIGNMENTS = 3000

type AssignmentEntry = {
  round?: unknown
  accountId?: unknown
  mediaId?: unknown
}

function cleanText(value: unknown, max = 2200) {
  return String(value || "").trim().slice(0, max)
}

function uniqueStrings(value: unknown, limit?: number): string[] {
  if (!Array.isArray(value)) return []

  const values = Array.from(
    new Set<string>(value.map((item: unknown) => String(item)))
  )

  return typeof limit === "number" ? values.slice(0, limit) : values
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const now = new Date()

  const batches = await prisma.postingBatch.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      accounts: {
        where: {
          instagramAccount: {
            connectionType: "official",
            isActive: true,
            accessToken: { not: null },
            appConfigId: { not: null },
            tokenExpiresAt: { gt: now },
          },
        },
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
    executorConfigured: Boolean(
      process.env.CRON_SECRET?.trim() || process.env.QUEUE_CRON_SECRET?.trim()
    ),
  })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    await maintainInstagramAccounts(session.user.id)
    const body = await request.json()

    // Modo aleatório por conta: cada item já vem com a conta e o vídeo dele.
    const rawAssignments = Array.isArray(body.assignments)
      ? (body.assignments as AssignmentEntry[]).slice(0, MAX_ASSIGNMENTS)
      : []
    const perAccountMode = rawAssignments.length > 0

    const mediaIds = uniqueStrings(body.mediaIds, perAccountMode ? MAX_ASSIGNMENTS : 50)
    const accountIds = uniqueStrings(body.accountIds)

    const publicationType = String(body.publicationType || "post").toLowerCase()
    const captionMode = publicationType === "story" ? "none" : String(body.captionMode || "single")
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
    if (!["post", "story"].includes(publicationType)) {
      return NextResponse.json({ error: "Tipo de publicação inválido." }, { status: 400 })
    }
    if (publicationType === "post" && !CAPTION_MODES.has(captionMode)) {
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
          accessToken: { not: null },
          tokenExpiresAt: { gt: new Date() },
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

    const accountIdSet = new Set(accounts.map((account) => account.id))
    const mediaIdSet = new Set(mediaIds)

    const assignments = rawAssignments.map((entry) => ({
      round: Number(entry.round),
      accountId: String(entry.accountId || ""),
      mediaId: String(entry.mediaId || ""),
    }))

    if (
      perAccountMode &&
      !assignments.every(
        (entry) =>
          Number.isInteger(entry.round) &&
          entry.round >= 0 &&
          accountIdSet.has(entry.accountId) &&
          mediaIdSet.has(entry.mediaId)
      )
    ) {
      return NextResponse.json(
        { error: "A distribuição de vídeos por conta veio inválida." },
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
    const coverEntries = Array.isArray(body.itemCovers)
      ? (body.itemCovers as CoverEntry[])
      : []
    const validCoverEntries = coverEntries
      .map((entry) => ({
        mediaId: String(entry.mediaId || ""),
        coverUrl: String(entry.coverUrl || "").trim(),
      }))
      .filter((entry) => entry.mediaId && entry.coverUrl)

    if (!validCoverEntries.every((entry) => isMediaDeliveryUrl(entry.coverUrl))) {
      return NextResponse.json(
        { error: "Uma ou mais capas não foram enviadas corretamente." },
        { status: 400 }
      )
    }

    const itemCoverMap = new Map(validCoverEntries.map((entry) => [entry.mediaId, entry.coverUrl]))
    const singleCaption = cleanText(body.singleCaption)
    const singleHashtags = cleanText(body.singleHashtags, 500)

    if (publicationType === "post" && captionMode === "rotate" && rotationCaptions.length === 0) {
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

    // Sem modo por conta, cada mídia vira um item que vai para todas as contas.
    // Com modo por conta, cada par (rodada, conta) vira um item próprio — todas
    // as contas de uma mesma rodada saem no mesmo horário.
    const plannedItems = perAccountMode
      ? assignments.map((entry) => ({
          mediaId: entry.mediaId,
          slot: entry.round,
          instagramAccountId: entry.accountId as string | null,
        }))
      : mediaIds.map((mediaId, index) => ({
          mediaId,
          slot: index,
          instagramAccountId: null as string | null,
        }))

    const batchItems = plannedItems.map((planned, index) => {
      const mediaId = planned.mediaId
      const media = mediaMap.get(mediaId)
      if (!media) {
        throw new Error("Mídia não encontrada durante o agendamento.")
      }

      const scheduledAt = new Date(
        startAt.getTime() + planned.slot * intervalMinutes * 60 * 1000
      )
      const text = getCaption(mediaId, planned.slot)
      const caption = publicationType === "story" ? "" : text.caption
      const hashtags = publicationType === "story" ? "" : text.hashtags
      const coverUrl =
        publicationType === "story" || media.type !== "video"
          ? null
          : itemCoverMap.get(mediaId) || null

      return {
        position: index,
        instagramAccountId: planned.instagramAccountId,
        caption,
        hashtags,
        scheduledAt,
        media: {
          connect: { id: media.id },
        },
        post: {
          create: {
            user: {
              connect: { id: session.user.id },
            },
            imageUrl: media.type === "image" ? media.url : null,
            videoUrl: media.type === "video" ? media.url : null,
            coverUrl,
            publicationType,
            caption,
            hashtags,
            status: "scheduled",
            scheduledAt,
          },
        },
      }
    })

    const batch = await prisma.postingBatch.create({
      data: {
        userId: session.user.id,
        name,
        captionMode,
        publicationType,
        intervalMinutes,
        startAt,
        totalItems: batchItems.length,
        accounts: {
          create: accounts.map((account) => ({
            instagramAccountId: account.id,
          })),
        },
        items: {
          create: batchItems,
        },
      },
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
