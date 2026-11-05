import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { publishExistingPost } from "@/lib/instagram-publisher"
import { refreshBatchStats } from "@/lib/queue-processor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 280

// Limite de publicações repetidas por clique — se o usuário tiver mais falhas
// que isso, ele clica de novo e pega o próximo lote. Evita estourar o
// maxDuration quando o backlog de falhas é muito grande.
const MAX_POSTS_PER_RUN = 50
// Quantas publicações são repetidas em paralelo. Cada uma já dispara
// publicações em paralelo por conta (ACCOUNT_CONCURRENCY) por dentro, então
// aqui fica baixo de propósito pra não multiplicar a carga no banco/Meta.
const POST_CONCURRENCY = 5

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let index = 0
  async function worker() {
    while (index < items.length) {
      const current = index++
      results[current] = await fn(items[current])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// Repete TODAS as publicações com falha/parcial do usuário de uma vez —
// diferente do /api/posts/[id]/retry, que repete uma publicação específica.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const userId = session.user.id

  const failedPosts = await prisma.post.findMany({
    where: { userId, status: { in: ["failed", "partial"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: MAX_POSTS_PER_RUN,
  })

  if (failedPosts.length === 0) {
    return NextResponse.json(
      { error: "Não há publicações com falha." },
      { status: 409 }
    )
  }

  const outcomes = await mapWithConcurrency(failedPosts, POST_CONCURRENCY, async (post) => {
    try {
      const failedLogs = await prisma.postLog.findMany({
        where: { postId: post.id, status: "error" },
        select: { instagramAccountId: true },
      })
      const accountIds = Array.from(
        new Set(
          failedLogs
            .map((log) => log.instagramAccountId)
            .filter((id): id is string => Boolean(id))
        )
      )
      if (accountIds.length === 0) {
        return { postId: post.id, ok: true, successCount: 0, failedCount: 0 }
      }

      const { results } = await publishExistingPost({
        postId: post.id,
        userId,
        accountIds,
      })

      const batchItem = await prisma.postingBatchItem.findFirst({
        where: { postId: post.id },
        select: { id: true, batchId: true },
      })
      if (batchItem) {
        const allLogs = await prisma.postLog.findMany({
          where: { postId: post.id },
          select: { status: true, errorMessage: true },
        })
        const stillFailing = allLogs.some((log) => log.status === "error")
        await prisma.postingBatchItem.update({
          where: { id: batchItem.id },
          data: stillFailing
            ? {
                status: "pending",
                attempts: 0,
                scheduledAt: new Date(),
                processingStartedAt: null,
                processedAt: null,
                lastError:
                  allLogs.find((log) => log.status === "error")?.errorMessage || null,
              }
            : {
                status: "published",
                processedAt: new Date(),
                processingStartedAt: null,
                lastError: null,
              },
        })
        await refreshBatchStats(batchItem.batchId)
      }

      const successCount = results.filter((result) => result.status === "success").length
      return { postId: post.id, ok: true, successCount, failedCount: results.length - successCount }
    } catch (error) {
      return {
        postId: post.id,
        ok: false,
        successCount: 0,
        failedCount: 0,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      }
    }
  })

  const postsRetried = outcomes.length
  const postsFixed = outcomes.filter((o) => o.ok && o.failedCount === 0).length
  const postsStillFailing = outcomes.filter((o) => !o.ok || o.failedCount > 0).length
  const accountsSucceeded = outcomes.reduce((sum, o) => sum + o.successCount, 0)
  const accountsFailed = outcomes.reduce((sum, o) => sum + o.failedCount, 0)
  const hasMore = failedPosts.length === MAX_POSTS_PER_RUN

  return NextResponse.json({
    success: true,
    postsRetried,
    postsFixed,
    postsStillFailing,
    accountsSucceeded,
    accountsFailed,
    hasMore,
  })
}
