import {
  INSTAGRAM_OFFICIAL_CONNECTION,
  isInstagramAccountUsable,
  isInstagramDisconnectError,
  maintainInstagramAccounts,
  markInstagramAccountDisconnected,
} from "@/lib/instagram-account-lifecycle"
import {
  getMetaError,
  INSTAGRAM_GRAPH_VERSION,
  metaErrorMessage,
  readJsonResponse,
} from "@/lib/instagram-meta"
import { prisma } from "@/lib/prisma"
import { fetchInstagramRequest } from "@/lib/instagram-http"
import { decryptValue, encryptValue } from "@/lib/secure-store"

export type PublishResult = {
  accountId: string
  username: string
  status: "success" | "error"
  error?: string
  alreadyPublished?: boolean
  retryable?: boolean
  retryAfterMs?: number
}

type OfficialAccount = {
  id: string
  username: string
  igUserId: string
  accessToken: string | null
  tokenExpiresAt: Date | null
  appConfigId: string | null
  connectionType: string
  isActive: boolean
}

const GRAPH_BASE = `https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}`
const TOKEN_REFRESH_WINDOW = 7 * 24 * 60 * 60 * 1000
const WAIT_INTERVAL = 4_000
const MAX_STATUS_CHECKS = 35
const MAX_ACCOUNT_ATTEMPTS = 3
const ACCOUNT_CONCURRENCY = 4
const DEFAULT_PUBLISH_LIMIT_RETRY_MS = 24 * 60 * 60 * 1000

type InstagramOperationError = Error & {
  metaCode?: number
  metaSubcode?: number
  httpStatus?: number
  retryAfterMs?: number
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(items[index], index)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run())
  )

  return results
}

async function metaRequest(
  path: string,
  accountId: string,
  options: RequestInit & { searchParams?: Record<string, string> } = {}
) {
  const url = new URL(`${GRAPH_BASE}/${path.replace(/^\//, "")}`)

  Object.entries(options.searchParams || {}).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })

  const { searchParams: _searchParams, ...requestOptions } = options
  const response = await fetchInstagramRequest(url, requestOptions)
  const { payload, raw } = await readJsonResponse(response)

  if (!response.ok || !payload) {
    console.error("Instagram Graph API error", {
      path,
      status: response.status,
      body: raw.slice(0, 1200),
    })
    const metaError = getMetaError(payload)
    const error = new Error(metaErrorMessage(metaError)) as InstagramOperationError
    error.metaCode = metaError?.code
    error.metaSubcode = metaError?.error_subcode
    error.httpStatus = response.status
    if (metaError?.code === 9 && metaError.error_subcode === 2207042) {
      error.retryAfterMs = DEFAULT_PUBLISH_LIMIT_RETRY_MS
    }
    throw error
  }

  return payload
}

function isPublishingLimitError(error: unknown) {
  const operationError = error as InstagramOperationError
  if (
    operationError?.metaCode === 9 &&
    operationError?.metaSubcode === 2207042
  ) {
    return true
  }

  const message = error instanceof Error ? error.message.toLowerCase() : ""
  return (
    message.includes("limite de publicação") ||
    message.includes("media publish limit") ||
    message.includes("user is performing too many actions")
  )
}

function isPrismaForeignKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2003"
  )
}

async function replacePostLogSafely(params: {
  postId: string
  accountId: string
  status: "success" | "error"
  mediaId?: string
  errorMessage?: string
}) {
  const accountExists = await prisma.instagramAccount.findUnique({
    where: { id: params.accountId },
    select: { id: true },
  })

  if (!accountExists) {
    console.warn("Skipping PostLog because Instagram account was removed", {
      postId: params.postId,
      accountId: params.accountId,
      status: params.status,
    })
    return false
  }

  try {
    await prisma.$transaction([
      prisma.postLog.deleteMany({
        where: {
          postId: params.postId,
          instagramAccountId: params.accountId,
          status: "error",
        },
      }),
      prisma.postLog.create({
        data: {
          postId: params.postId,
          instagramAccountId: params.accountId,
          status: params.status,
          mediaId: params.mediaId,
          errorMessage: params.errorMessage,
        },
      }),
    ])
    return true
  } catch (error) {
    if (!isPrismaForeignKeyError(error)) throw error

    console.warn("Skipping PostLog after account/post was removed concurrently", {
      postId: params.postId,
      accountId: params.accountId,
      status: params.status,
    })
    return false
  }
}

async function ensurePublishingQuota(account: OfficialAccount, token: string) {
  try {
    const payload = await metaRequest(
      `${account.igUserId}/content_publishing_limit`,
      account.id,
      {
        searchParams: {
          fields: "config,quota_usage",
          access_token: token,
        },
      }
    )

    const entry = Array.isArray(payload?.data) ? payload.data[0] : null
    const usage = Number(entry?.quota_usage)
    const total = Number(entry?.config?.quota_total)
    const durationSeconds = Number(entry?.config?.quota_duration)

    if (
      Number.isFinite(usage) &&
      Number.isFinite(total) &&
      total > 0 &&
      usage >= total
    ) {
      const error = new Error(
        `Limite de publicação da Meta atingido para esta conta (${usage}/${total}).`
      ) as InstagramOperationError
      error.metaCode = 9
      error.metaSubcode = 2207042
      error.retryAfterMs =
        Number.isFinite(durationSeconds) && durationSeconds > 0
          ? durationSeconds * 1000
          : DEFAULT_PUBLISH_LIMIT_RETRY_MS
      throw error
    }
  } catch (error) {
    if (isPublishingLimitError(error)) throw error

    // A consulta de cota é preventiva. Se ela estiver indisponível, não
    // bloqueia uma publicação que a própria Meta ainda pode aceitar.
    console.warn("Instagram publishing quota check failed; continuing", {
      accountId: account.id,
      message: error instanceof Error ? error.message : String(error),
    })
  }
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

  const response = await fetchInstagramRequest(url)
  const { payload, raw } = await readJsonResponse(response)

  if (!response.ok || !payload?.access_token) {
    console.error("Instagram token refresh failed", {
      accountId: account.id,
      status: response.status,
      body: raw.slice(0, 1000),
    })
    const metaError = getMetaError(payload)
    const error = new Error(
      metaError
        ? metaErrorMessage(metaError)
        : "Não foi possível renovar o acesso desta conta agora. Tente novamente."
    ) as Error & { metaCode?: number }
    error.metaCode = metaError?.code
    throw error
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
      connectionType: INSTAGRAM_OFFICIAL_CONNECTION,
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
  publicationType: string
}) {
  const body = new URLSearchParams({ access_token: params.token })

  if (params.publicationType === "story") {
    body.set("media_type", "STORIES")
    if (params.videoUrl) body.set("video_url", params.videoUrl)
    else body.set("image_url", params.imageUrl)
  } else if (params.videoUrl) {
    body.set("media_type", "REELS")
    body.set("video_url", params.videoUrl)
    body.set("share_to_feed", "true")
    if (params.coverUrl) body.set("cover_url", params.coverUrl)
    if (params.caption) body.set("caption", params.caption)
  } else {
    body.set("image_url", params.imageUrl)
    if (params.caption) body.set("caption", params.caption)
  }

  const payload = await metaRequest(
    `${params.account.igUserId}/media`,
    params.account.id,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  )

  if (!payload.id) throw new Error("A Meta não retornou o contêiner da publicação.")
  return String(payload.id)
}

async function waitUntilReady(
  containerId: string,
  token: string,
  accountId: string
) {
  for (let attempt = 0; attempt < MAX_STATUS_CHECKS; attempt += 1) {
    const payload = await metaRequest(containerId, accountId, {
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
  const payload = await metaRequest(
    `${account.igUserId}/media_publish`,
    account.id,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: containerId,
        access_token: token,
      }),
    }
  )

  if (!payload.id) throw new Error("A Meta não retornou o ID da publicação.")
  return String(payload.id)
}

function isRetryablePrePublishError(error: unknown) {
  const metaCode = (error as Error & { metaCode?: number })?.metaCode
  if ([4, 17, 32].includes(metaCode || -1)) return true

  const message = error instanceof Error ? error.message.toLowerCase() : ""
  return [
    "tempo limite",
    "demorou demais",
    "temporário",
    "temporariamente",
    "timeout",
    "etimedout",
    "econnreset",
    "econnrefused",
    "fetch failed",
  ].some((fragment) => message.includes(fragment))
}

async function publishToAccount(params: {
  account: OfficialAccount
  post: {
    id: string
    imageUrl: string | null
    videoUrl: string | null
    coverUrl: string | null
    publicationType: string
  }
  coverUrl?: string
  caption: string
}) {
  let lastError: unknown = null

  for (let attempt = 1; attempt <= MAX_ACCOUNT_ATTEMPTS; attempt += 1) {
    let stage: "prepare" | "publish" = "prepare"

    try {
      const token = await refreshAccessTokenIfNeeded(params.account)
      await ensurePublishingQuota(params.account, token)
      const containerId = await createContainer({
        account: params.account,
        token,
        imageUrl: params.post.imageUrl || "",
        videoUrl: params.post.videoUrl || "",
        coverUrl: params.coverUrl || params.post.coverUrl || "",
        caption: params.post.publicationType === "story" ? "" : params.caption,
        publicationType: params.post.publicationType,
      })

      await waitUntilReady(containerId, token, params.account.id)
      stage = "publish"
      const mediaId = await publishContainer(params.account, containerId, token)

      await prisma.instagramAccount.updateMany({
        where: { id: params.account.id },
        data: {
          connectionType: INSTAGRAM_OFFICIAL_CONNECTION,
          isActive: true,
          lastActiveAt: new Date(),
        },
      })

      await replacePostLogSafely({
        postId: params.post.id,
        accountId: params.account.id,
        status: "success",
        mediaId,
      })

      return
    } catch (error) {
      lastError = error

      if (isInstagramDisconnectError(error)) {
        await markInstagramAccountDisconnected(params.account.id)
        break
      }

      // Depois de media_publish não repetimos automaticamente: se a resposta
      // se perder, uma nova tentativa poderia criar uma publicação duplicada.
      const canRetry =
        stage === "prepare" &&
        attempt < MAX_ACCOUNT_ATTEMPTS &&
        isRetryablePrePublishError(error)

      if (!canRetry) break
      await sleep(attempt * 1_500)
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Erro ao publicar no Instagram.")
}

export async function publishExistingPost(params: {
  postId: string
  userId: string
  accountIds: string[]
  coverUrl?: string
}) {
  await maintainInstagramAccounts(params.userId)

  const post = await prisma.post.findFirst({
    where: { id: params.postId, userId: params.userId },
    select: {
      id: true,
      imageUrl: true,
      videoUrl: true,
      caption: true,
      hashtags: true,
      coverUrl: true,
      publicationType: true,
    },
  })

  if (!post) throw new Error("Publicação não encontrada.")
  if ((!post.videoUrl && !post.imageUrl) || (post.videoUrl && post.imageUrl)) {
    throw new Error("A publicação precisa ter exatamente uma mídia.")
  }

  const requestedAccountIds = Array.from(new Set<string>(params.accountIds))
  if (requestedAccountIds.length === 0) {
    throw new Error("Nenhuma conta conectada foi selecionada.")
  }

  const [accounts, successfulLogs] = await Promise.all([
    prisma.instagramAccount.findMany({
      where: {
        id: { in: requestedAccountIds },
        userId: params.userId,
      },
      select: {
        id: true,
        username: true,
        igUserId: true,
        accessToken: true,
        tokenExpiresAt: true,
        appConfigId: true,
        connectionType: true,
        isActive: true,
      },
    }),
    prisma.postLog.findMany({
      where: {
        postId: post.id,
        instagramAccountId: { in: requestedAccountIds },
        status: "success",
      },
      select: { instagramAccountId: true },
    }),
  ])

  const accountMap = new Map<string, OfficialAccount>(
    accounts.map((account) => [account.id, account] as const)
  )
  const alreadyPublishedIds = new Set(
    successfulLogs.map((log) => log.instagramAccountId)
  )

  await prisma.post.update({
    where: { id: post.id },
    data: { status: "publishing" },
  })

  const fullCaption = [post.caption?.trim(), post.hashtags?.trim()]
    .filter(Boolean)
    .join("\n\n")

  const results = await mapWithConcurrency(
    requestedAccountIds,
    ACCOUNT_CONCURRENCY,
    async (accountId): Promise<PublishResult> => {
      const account = accountMap.get(accountId)

      if (alreadyPublishedIds.has(accountId)) {
        return {
          accountId,
          username: account?.username || "conta-publicada",
          status: "success",
          alreadyPublished: true,
        }
      }

      if (!account) {
        return {
          accountId,
          username: "conta-removida",
          status: "error",
          error: "A conta selecionada não está mais disponível.",
          retryable: false,
        }
      }

      if (!isInstagramAccountUsable(account)) {
        return {
          accountId: account.id,
          username: account.username,
          status: "error",
          error: "Esta conta está desconectada e não será usada para publicar.",
          retryable: false,
        }
      }

      try {
        await publishToAccount({
          account,
          post,
          coverUrl: params.coverUrl,
          caption: fullCaption,
        })

        return {
          accountId: account.id,
          username: account.username,
          status: "success",
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Erro ao publicar"

        await replacePostLogSafely({
          postId: post.id,
          accountId: account.id,
          status: "error",
          errorMessage: message,
        })

        const operationError = error as InstagramOperationError
        const publishLimit = isPublishingLimitError(error)

        return {
          accountId: account.id,
          username: account.username,
          status: "error",
          error: message,
          retryable: !isInstagramDisconnectError(error),
          retryAfterMs: publishLimit
            ? operationError.retryAfterMs || DEFAULT_PUBLISH_LIMIT_RETRY_MS
            : undefined,
        }
      }
    }
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

  return { post: updatedPost, results }
}
