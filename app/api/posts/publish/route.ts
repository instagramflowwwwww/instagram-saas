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

    const post = await prisma.post.create({
      data: {
        userId: session.user.id,
        videoUrl: videoUrl || null,
        imageUrl: imageUrl || null,
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

    return NextResponse.json(result)
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
