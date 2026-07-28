import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import {
  decryptInstagramSession,
  encryptInstagramSession,
} from "@/lib/instagram-session"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const maxDuration = 300

type PublishResult = {
  accountId: string
  username: string
  status: "success" | "error"
  error?: string
}

function isCloudinaryUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com"
  } catch {
    return false
  }
}

function getWorkerError(payload: any) {
  const detail = payload?.detail

  if (typeof detail === "string") {
    return { code: payload?.code, message: detail }
  }

  if (detail && typeof detail === "object") {
    return {
      code: detail.code,
      message: detail.message || "Erro ao publicar no Instagram",
    }
  }

  return {
    code: payload?.code,
    message:
      payload?.error || payload?.message || "Erro ao publicar no Instagram",
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const workerKey = process.env.INSTAGRAPI_WORKER_API_KEY
    if (!workerKey) {
      return NextResponse.json(
        { error: "INSTAGRAPI_WORKER_API_KEY não configurada na Vercel" },
        { status: 500 }
      )
    }

    const body = await request.json()
    const videoUrl = String(body.videoUrl || "")
    const imageUrl = String(body.imageUrl || "")
    const coverUrl = String(body.coverUrl || "")
    const caption = String(body.caption || "").trim()
    const hashtags = String(body.hashtags || "").trim()
    const accountIds = Array.isArray(body.accountIds)
      ? body.accountIds.map(String)
      : []

    if ((!videoUrl && !imageUrl) || (videoUrl && imageUrl)) {
      return NextResponse.json(
        { error: "Envie uma imagem ou um vídeo, nunca os dois ao mesmo tempo" },
        { status: 400 }
      )
    }

    if (videoUrl && !coverUrl) {
      return NextResponse.json(
        { error: "A capa é obrigatória para publicar um Reel" },
        { status: 400 }
      )
    }

    const mediaUrls = [videoUrl, imageUrl, coverUrl].filter(Boolean)
    if (!mediaUrls.every(isCloudinaryUrl)) {
      return NextResponse.json(
        { error: "Uma das mídias não foi enviada corretamente ao Cloudinary" },
        { status: 400 }
      )
    }

    if (accountIds.length === 0) {
      return NextResponse.json(
        { error: "Selecione pelo menos uma conta" },
        { status: 400 }
      )
    }

    const accounts = await prisma.instagramAccount.findMany({
      where: {
        id: { in: accountIds },
        userId: session.user.id,
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        instagramUsername: true,
        sessionFilePath: true,
        proxy: true,
      },
    })

    if (accounts.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma conta conectada válida foi encontrada" },
        { status: 400 }
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

    const fullCaption = [caption, hashtags].filter(Boolean).join("\n\n")
    const workerUrl = new URL("/api/index", request.url)

    const results = await Promise.all(
      accounts.map(async (account): Promise<PublishResult> => {
        try {
          if (!account.sessionFilePath) {
            throw new Error("Conta sem sessão. Reconecte o Instagram.")
          }

          const sessionSettings = decryptInstagramSession(
            account.sessionFilePath
          )
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 280_000)
          let workerResponse: Response

          try {
            workerResponse = await fetch(workerUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Worker-Key": workerKey,
              },
              body: JSON.stringify({
                action: "post",
                username: account.instagramUsername || account.username,
                session_settings: sessionSettings,
                proxy: account.proxy,
                media_type: videoUrl ? "video" : "photo",
                media_url: videoUrl || imageUrl,
                cover_url: coverUrl || null,
                caption: fullCaption,
              }),
              cache: "no-store",
              signal: controller.signal,
            })
          } finally {
            clearTimeout(timeout)
          }

          const workerData = await workerResponse.json().catch(() => ({}))

          if (!workerResponse.ok) {
            const workerError = getWorkerError(workerData)

            if (workerError.code === "SESSION_EXPIRED") {
              await prisma.instagramAccount.update({
                where: { id: account.id },
                data: { isActive: false },
              })
            }

            throw new Error(workerError.message)
          }

          const mediaId = workerData?.result?.pk
          if (!mediaId) {
            throw new Error(
              "O Instagram não retornou o identificador da publicação"
            )
          }

          await Promise.all([
            prisma.instagramAccount.update({
              where: { id: account.id },
              data: {
                ...(workerData.session
                  ? {
                      sessionFilePath: encryptInstagramSession(
                        workerData.session
                      ),
                    }
                  : {}),
                isActive: true,
                lastActiveAt: new Date(),
              },
            }),
            prisma.postLog.create({
              data: {
                postId: post.id,
                instagramAccountId: account.id,
                status: "success",
                mediaId: String(mediaId),
              },
            }),
          ])

          return {
            accountId: account.id,
            username: account.username,
            status: "success",
          }
        } catch (error: any) {
          const message =
            error?.name === "AbortError"
              ? "A publicação demorou demais e foi interrompida"
              : error?.message || "Erro ao publicar"

          await prisma.postLog.create({
            data: {
              postId: post.id,
              instagramAccountId: account.id,
              status: "error",
              errorMessage: message,
            },
          })

          return {
            accountId: account.id,
            username: account.username,
            status: "error",
            error: message,
          }
        }
      })
    )

    const successCount = results.filter(
      (result) => result.status === "success"
    ).length
    const status =
      successCount === results.length
        ? "published"
        : successCount === 0
          ? "failed"
          : "partial"

    const updatedPost = await prisma.post.update({
      where: { id: post.id },
      data: {
        status,
        publishedAt: successCount > 0 ? new Date() : null,
      },
    })

    return NextResponse.json({ post: updatedPost, results })
  } catch (error: any) {
    console.error("Publish error:", error)
    return NextResponse.json(
      { error: error?.message || "Erro interno ao publicar" },
      { status: 500 }
    )
  }
}
