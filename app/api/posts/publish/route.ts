import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import {
  getMetaError,
  INSTAGRAM_GRAPH_VERSION,
  metaErrorMessage,
  readJsonResponse,
} from "@/lib/instagram-meta"
import { prisma } from "@/lib/prisma"
import { decryptValue, encryptValue } from "@/lib/secure-store"

export const runtime = "nodejs"
export const maxDuration = 300

type PublishResult = {
  accountId: string
  username: string
  status: "success" | "error"
  error?: string
}

type OfficialAccount = {
  id: string
  username: string
  igUserId: string
  accessToken: string | null
  tokenExpiresAt: Date | null
  connectionType: string
  isActive: boolean
}

const GRAPH_BASE = `https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}`
const TOKEN_REFRESH_WINDOW = 7 * 24 * 60 * 60 * 1000
const WAIT_INTERVAL = 4_000
const MAX_STATUS_CHECKS = 35

function isCloudinaryUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com"
  } catch {
    return false
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function metaRequest(
  path: string,
  options: RequestInit & { searchParams?: Record<string, string> } = {}
) {
  const url = new URL(`${GRAPH_BASE}/${path.replace(/^\//, "")}`)

  Object.entries(options.searchParams || {}).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })

  const response = await fetch(url, {
    ...options,
    cache: "no-store",
  })
  const { payload, raw } = await readJsonResponse(response)

  if (!response.ok || !payload) {
    console.error("Instagram Graph API error", {
      path,
      status: response.status,
      body: raw.slice(0, 1200),
    })
    const metaError = getMetaError(payload)
    const error = new Error(metaErrorMessage(metaError)) as Error & {
      metaCode?: number
    }
    error.metaCode = metaError?.code
    throw error
  }

  return payload
}

async function refreshAccessTokenIfNeeded(account: OfficialAccount) {
  if (!account.accessToken) {
    throw new Error("Conta sem token oficial. Reconecte pelo App Meta.")
  }

  let token = decryptValue(account.accessToken)
  let expiresAt = account.tokenExpiresAt

  const needsRefresh =
    !expiresAt || expiresAt.getTime() - Date.now() <= TOKEN_REFRESH_WINDOW

  if (!needsRefresh) {
    return { token, expiresAt, refreshed: false }
  }

  const url = new URL("https://graph.instagram.com/refresh_access_token")
  url.searchParams.set("grant_type", "ig_refresh_token")
  url.searchParams.set("access_token", token)

  const response = await fetch(url, { cache: "no-store" })
  const { payload, raw } = await readJsonResponse(response)

  if (!response.ok || !payload?.access_token) {
    console.error("Instagram token refresh failed", {
      accountId: account.id,
      status: response.status,
      body: raw.slice(0, 1000),
    })
    throw new Error(
      "O acesso desta conta expirou. Reconecte a conta pelo App Meta."
    )
  }

  token = String(payload.access_token)
  expiresAt = new Date(
    Date.now() + Number(payload.expires_in || 60 * 24 * 60 * 60) * 1000
  )

  await prisma.instagramAccount.update({
    where: { id: account.id },
    data: {
      accessToken: encryptValue(token),
      tokenExpiresAt: expiresAt,
      isActive: true,
      lastActiveAt: new Date(),
    },
  })

  return { token, expiresAt, refreshed: true }
}

async function createContainer(params: {
  account: OfficialAccount
  token: string
  imageUrl: string
  videoUrl: string
  coverUrl: string
  caption: string
}) {
  const body = new URLSearchParams({
    access_token: params.token,
    caption: params.caption,
  })

  if (params.videoUrl) {
    body.set("media_type", "REELS")
    body.set("video_url", params.videoUrl)
    body.set("share_to_feed", "true")
    if (params.coverUrl) body.set("cover_url", params.coverUrl)
  } else {
    body.set("image_url", params.imageUrl)
  }

  const payload = await metaRequest(`${params.account.igUserId}/media`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  })

  if (!payload.id) {
    throw new Error("A Meta não retornou o contêiner da publicação.")
  }

  return String(payload.id)
}

async function waitUntilReady(containerId: string, token: string) {
  for (let attempt = 0; attempt < MAX_STATUS_CHECKS; attempt += 1) {
    const payload = await metaRequest(containerId, {
      searchParams: {
        fields: "status_code,status",
        access_token: token,
      },
    })

    const statusCode = String(payload.status_code || "").toUpperCase()

    if (statusCode === "FINISHED") return

    if (["ERROR", "EXPIRED"].includes(statusCode)) {
      throw new Error(
        String(payload.status || "A Meta não conseguiu processar a mídia.")
      )
    }

    await sleep(WAIT_INTERVAL)
  }

  throw new Error(
    "A mídia demorou demais para ser processada pela Meta. Tente novamente."
  )
}

async function publishContainer(
  account: OfficialAccount,
  containerId: string,
  token: string
) {
  const payload = await metaRequest(`${account.igUserId}/media_publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      creation_id: containerId,
      access_token: token,
    }),
  })

  if (!payload.id) {
    throw new Error("A Meta não retornou o ID da publicação.")
  }

  return String(payload.id)
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
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
        { error: "Envie uma imagem ou um vídeo, nunca os dois ao mesmo tempo." },
        { status: 400 }
      )
    }

    if (videoUrl && !coverUrl) {
      return NextResponse.json(
        { error: "A capa é obrigatória para publicar um Reel." },
        { status: 400 }
      )
    }

    const mediaUrls = [videoUrl, imageUrl, coverUrl].filter(Boolean)
    if (!mediaUrls.every(isCloudinaryUrl)) {
      return NextResponse.json(
        { error: "Uma das mídias não foi enviada corretamente ao Cloudinary." },
        { status: 400 }
      )
    }

    if (accountIds.length === 0) {
      return NextResponse.json(
        { error: "Selecione pelo menos uma conta." },
        { status: 400 }
      )
    }

    const accounts = await prisma.instagramAccount.findMany({
      where: {
        id: { in: accountIds },
        userId: session.user.id,
        isActive: true,
        connectionType: "official",
        appConfigId: { not: null },
      },
      select: {
        id: true,
        username: true,
        igUserId: true,
        accessToken: true,
        tokenExpiresAt: true,
        connectionType: true,
        isActive: true,
      },
    })

    if (accounts.length === 0) {
      return NextResponse.json(
        {
          error:
            "Nenhuma conta oficial ativa foi encontrada. Conecte a conta pelo App Meta.",
        },
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

    const results = await Promise.all(
      accounts.map(async (account): Promise<PublishResult> => {
        try {
          const { token } = await refreshAccessTokenIfNeeded(account)
          const containerId = await createContainer({
            account,
            token,
            imageUrl,
            videoUrl,
            coverUrl,
            caption: fullCaption,
          })

          await waitUntilReady(containerId, token)
          const mediaId = await publishContainer(account, containerId, token)

          await Promise.all([
            prisma.instagramAccount.update({
              where: { id: account.id },
              data: {
                isActive: true,
                lastActiveAt: new Date(),
              },
            }),
            prisma.postLog.create({
              data: {
                postId: post.id,
                instagramAccountId: account.id,
                status: "success",
                mediaId,
              },
            }),
          ])

          return {
            accountId: account.id,
            username: account.username,
            status: "success",
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Erro ao publicar"
          const metaCode = (error as Error & { metaCode?: number }).metaCode

          if (metaCode === 190 || message.includes("expirou")) {
            await prisma.instagramAccount.update({
              where: { id: account.id },
              data: { isActive: false },
            })
          }

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
    const finalStatus =
      successCount === results.length
        ? "published"
        : successCount === 0
          ? "failed"
          : "partial"

    const updatedPost = await prisma.post.update({
      where: { id: post.id },
      data: {
        status: finalStatus,
        publishedAt: successCount > 0 ? new Date() : null,
      },
    })

    return NextResponse.json({ post: updatedPost, results })
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
