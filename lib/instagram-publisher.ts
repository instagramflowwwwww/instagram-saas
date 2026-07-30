import {
  getMetaError,
  INSTAGRAM_GRAPH_VERSION,
  metaErrorMessage,
  readJsonResponse,
} from "@/lib/instagram-meta"
import { prisma } from "@/lib/prisma"
import { decryptValue, encryptValue } from "@/lib/secure-store"

export type PublishResult = {
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

  if (!needsRefresh) return token

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
    throw new Error("O acesso desta conta expirou. Reconecte a conta pelo App Meta.")
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

  return token
}

async function createContainer(params: {
  account: OfficialAccount
  token: string
  imageUrl: string
  videoUrl: string
  coverUrl?: string
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
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
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

export async function publishExistingPost(params: {
  postId: string
  userId: string
  accountIds: string[]
  coverUrl?: string
}) {
  const post = await prisma.post.findFirst({
    where: { id: params.postId, userId: params.userId },
    select: {
      id: true,
      imageUrl: true,
      videoUrl: true,
      caption: true,
      hashtags: true,
      coverUrl: true,
    },
  })

  if (!post) throw new Error("Publicação não encontrada.")
  if ((!post.videoUrl && !post.imageUrl) || (post.videoUrl && post.imageUrl)) {
    throw new Error("A publicação precisa ter exatamente uma mídia.")
  }

  const requestedAccountIds = Array.from(
    new Set<string>(params.accountIds)
  )
  const accounts = await prisma.instagramAccount.findMany({
    where: {
      id: { in: requestedAccountIds },
      userId: params.userId,
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
    throw new Error(
      "Nenhuma conta oficial foi encontrada. Conecte a conta pelo App Meta."
    )
  }

  const accountMap = new Map(accounts.map((account) => [account.id, account]))

  await prisma.post.update({
    where: { id: post.id },
    data: { status: "publishing" },
  })

  const fullCaption = [post.caption?.trim(), post.hashtags?.trim()]
    .filter(Boolean)
    .join("\n\n")

  const results = await Promise.all(
    requestedAccountIds.map(async (accountId): Promise<PublishResult> => {
      const account = accountMap.get(accountId)
      if (!account) {
        return {
          accountId,
          username: "conta-removida",
          status: "error",
          error: "A conta selecionada não está mais disponível.",
        }
      }

      if (!account.isActive || !account.accessToken) {
        const message = "Esta conta precisa ser reconectada pelo App Meta."
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

      try {
        const token = await refreshAccessTokenIfNeeded(account)
        const containerId = await createContainer({
          account,
          token,
          imageUrl: post.imageUrl || "",
          videoUrl: post.videoUrl || "",
          coverUrl: params.coverUrl || post.coverUrl || "",
          caption: fullCaption,
        })

        await waitUntilReady(containerId, token)
        const mediaId = await publishContainer(account, containerId, token)

        await Promise.all([
          prisma.instagramAccount.update({
            where: { id: account.id },
            data: { isActive: true, lastActiveAt: new Date() },
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
        const message = error instanceof Error ? error.message : "Erro ao publicar"
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

  const successCount = results.filter((result) => result.status === "success").length
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

  return { post: updatedPost, results }
}
