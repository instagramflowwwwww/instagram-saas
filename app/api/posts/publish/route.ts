import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { maintainInstagramAccounts } from "@/lib/instagram-account-lifecycle"
import { isMediaDeliveryUrl } from "@/lib/media-storage"
import { publishExistingPost } from "@/lib/instagram-publisher"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    await maintainInstagramAccounts(session.user.id)
    const body = await request.json()
    const videoUrl = String(body.videoUrl || "")
    const imageUrl = String(body.imageUrl || "")
    const coverUrl = String(body.coverUrl || "")
    const caption = String(body.caption || "").trim()
    const hashtags = String(body.hashtags || "").trim()
    const accountIds: string[] = Array.isArray(body.accountIds)
      ? Array.from(
          new Set(body.accountIds.map((accountId: unknown) => String(accountId)))
        )
      : []
    const rawScheduledAt = typeof body.scheduledAt === "string" ? body.scheduledAt.trim() : ""
    const scheduledAt = rawScheduledAt ? new Date(rawScheduledAt) : null

    if (rawScheduledAt && Number.isNaN(scheduledAt?.getTime())) {
      return NextResponse.json({ error: "Data de agendamento inválida." }, { status: 400 })
    }
    if (scheduledAt && scheduledAt.getTime() < Date.now() - 2 * 60 * 1000) {
      return NextResponse.json(
        { error: "A data de agendamento precisa estar no futuro." },
        { status: 400 }
      )
    }
    if (scheduledAt && scheduledAt.getTime() > Date.now() + 180 * 24 * 60 * 60 * 1000) {
      return NextResponse.json(
        { error: "O agendamento pode ser feito em até 180 dias." },
        { status: 400 }
      )
    }

    if ((!videoUrl && !imageUrl) || (videoUrl && imageUrl)) {
      return NextResponse.json(
        { error: "Envie uma imagem ou um vídeo, nunca os dois ao mesmo tempo." },
        { status: 400 }
      )
    }

    const mediaUrls = [videoUrl, imageUrl, coverUrl].filter(Boolean)
    if (!mediaUrls.every(isMediaDeliveryUrl)) {
      return NextResponse.json(
        { error: "Uma das mídias não foi enviada corretamente ao armazenamento." },
        { status: 400 }
      )
    }

    if (accountIds.length === 0) {
      return NextResponse.json(
        { error: "Selecione pelo menos uma conta." },
        { status: 400 }
      )
    }

    const connectedAccounts = await prisma.instagramAccount.count({
      where: {
        id: { in: accountIds },
        userId: session.user.id,
        connectionType: "official",
        isActive: true,
        accessToken: { not: null },
        appConfigId: { not: null },
        tokenExpiresAt: { gt: new Date() },
      },
    })

    if (connectedAccounts !== accountIds.length) {
      return NextResponse.json(
        {
          error:
            "Uma ou mais contas foram desconectadas. Atualize a página e selecione somente contas conectadas.",
        },
        { status: 409 }
      )
    }

    // Lotes grandes não são mais publicados dentro de uma única Function da
    // Vercel — entram na mesma fila resiliente das automações e são
    // processados em blocos pequenos, evitando timeout e republicação. Um
    // post agendado para o futuro precisa do mesmo caminho, não importa
    // quantas contas: publicar "daqui a 2 horas" não pode acontecer dentro
    // desta mesma requisição.
    if (accountIds.length > 4 || scheduledAt) {
      const startAt = scheduledAt || new Date()
      const batch = await prisma.postingBatch.create({
        data: {
          userId: session.user.id,
          name: scheduledAt ? "Publicação agendada" : "Publicação imediata",
          status: "scheduled",
          captionMode: "single",
          publicationType: "post",
          intervalMinutes: 5,
          startAt,
          totalItems: 1,
          accounts: {
            create: accountIds.map((instagramAccountId) => ({
              instagramAccountId,
            })),
          },
          items: {
            create: {
              position: 0,
              caption,
              hashtags,
              scheduledAt: startAt,
              post: {
                create: {
                  user: {
                    connect: { id: session.user.id },
                  },
                  videoUrl: videoUrl || null,
                  imageUrl: imageUrl || null,
                  coverUrl: coverUrl || null,
                  publicationType: "post",
                  caption,
                  hashtags,
                  status: "scheduled",
                  scheduledAt: startAt,
                },
              },
            },
          },
        },
        select: { id: true },
      })

      return NextResponse.json(
        {
          queued: true,
          batchId: batch.id,
          accountCount: accountIds.length,
          results: [],
        },
        { status: 202 }
      )
    }

    const post = await prisma.post.create({
      data: {
        userId: session.user.id,
        videoUrl: videoUrl || null,
        imageUrl: imageUrl || null,
        coverUrl: coverUrl || null,
        publicationType: "post",
        caption,
        hashtags,
        status: "publishing",
      },
    })

    const result = await publishExistingPost({
      postId: post.id,
      userId: session.user.id,
      accountIds,
      coverUrl,
    })

    return NextResponse.json({ ...result, queued: false })
  } catch (error) {
    console.error("Official Instagram publish error", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao publicar no Instagram.",
      },
      { status: 500 }
    )
  }
}
