import { ADMIN_EMAIL } from "@/lib/account-access"
import { publishExistingPost } from "@/lib/instagram-publisher"
import { prisma } from "@/lib/prisma"

const MAX_ATTEMPTS = 3
const STUCK_AFTER_MS = 20 * 60 * 1000

export async function refreshBatchStats(batchId: string) {
  const batch = await prisma.postingBatch.findUnique({
    where: { id: batchId },
    select: { id: true, status: true, totalItems: true },
  })
  if (!batch) return null

  const grouped = await prisma.postingBatchItem.groupBy({
    by: ["status"],
    where: { batchId },
    _count: { _all: true },
  })
  const counts = new Map<string, number>(
    grouped.map((entry) => [entry.status, entry._count._all] as const)
  )
  const published = counts.get("published") || 0
  const partial = counts.get("partial") || 0
  const failed = counts.get("failed") || 0
  const cancelled = counts.get("cancelled") || 0
  const processedItems = published + partial + failed + cancelled
  const hasStarted =
    processedItems > 0 ||
    (counts.get("processing") || 0) > 0 ||
    (counts.get("pending") || 0) < batch.totalItems

  let status = batch.status
  if (status !== "cancelled") {
    if (processedItems >= batch.totalItems && batch.totalItems > 0) {
      status = failed > 0 || partial > 0 ? "completed_with_errors" : "completed"
    } else {
      status = hasStarted ? "processing" : "scheduled"
    }
  }

  return prisma.postingBatch.update({
    where: { id: batchId },
    data: {
      status,
      processedItems,
      successItems: published + partial,
      failedItems: failed + partial,
    },
  })
}

async function recoverStuckItems(userId?: string) {
  const threshold = new Date(Date.now() - STUCK_AFTER_MS)
  const stuck = await prisma.postingBatchItem.findMany({
    where: {
      status: "processing",
      processingStartedAt: { lt: threshold },
      batch: {
        status: { not: "cancelled" },
        ...(userId ? { userId } : {}),
      },
    },
    select: { id: true, postId: true, batchId: true },
    take: 20,
  })

  for (const item of stuck) {
    await prisma.$transaction([
      prisma.postingBatchItem.update({
        where: { id: item.id },
        data: {
          status: "pending",
          scheduledAt: new Date(),
          processingStartedAt: null,
          lastError: "Processamento anterior interrompido; reagendado automaticamente.",
        },
      }),
      ...(item.postId
        ? [
            prisma.post.update({
              where: { id: item.postId },
              data: { status: "scheduled" },
            }),
          ]
        : []),
    ])
    await refreshBatchStats(item.batchId)
  }
}

function retryDate(attempts: number) {
  return new Date(Date.now() + Math.max(10, attempts * 10) * 60 * 1000)
}

export async function processDueQueue(options: {
  userId?: string
  limit?: number
} = {}) {
  await recoverStuckItems(options.userId)

  const dueItems = await prisma.postingBatchItem.findMany({
    where: {
      status: "pending",
      scheduledAt: { lte: new Date() },
      batch: {
        status: { in: ["scheduled", "processing"] },
        ...(options.userId ? { userId: options.userId } : {}),
        user: {
          OR: [
            { email: ADMIN_EMAIL },
            {
              accessStatus: "approved",
              OR: [
                { accessExpiresAt: null },
                { accessExpiresAt: { gt: new Date() } },
              ],
            },
          ],
        },
      },
    },
    orderBy: [{ scheduledAt: "asc" }, { position: "asc" }],
    select: { id: true },
    take: Math.min(Math.max(options.limit || 1, 1), 10),
  })

  console.info("[queue] Due items found", {
    userId: options.userId || "all",
    count: dueItems.length,
  })

  const processed: Array<{
    itemId: string
    status: string
    error?: string
  }> = []

  for (const candidate of dueItems) {
    console.info("[queue] Claiming item", { itemId: candidate.id })

    const claim = await prisma.postingBatchItem.updateMany({
      where: { id: candidate.id, status: "pending" },
      data: {
        status: "processing",
        processingStartedAt: new Date(),
        attempts: { increment: 1 },
      },
    })
    if (claim.count === 0) continue

    const item = await prisma.postingBatchItem.findUnique({
      where: { id: candidate.id },
      include: {
        batch: {
          include: {
            accounts: { select: { instagramAccountId: true } },
          },
        },
        post: { select: { id: true } },
      },
    })

    if (!item || !item.post || item.batch.status === "cancelled") {
      if (item) {
        await prisma.postingBatchItem.update({
          where: { id: item.id },
          data: {
            status: "cancelled",
            processedAt: new Date(),
            processingStartedAt: null,
          },
        })
        await refreshBatchStats(item.batchId)
      }
      continue
    }

    try {
      const result = await publishExistingPost({
        postId: item.post.id,
        userId: item.batch.userId,
        accountIds: item.batch.accounts.map((account) => account.instagramAccountId),
      })
      const postStatus = result.post.status
      const message = result.results
        .filter((entry) => entry.status === "error")
        .map((entry) => `@${entry.username}: ${entry.error || "Erro"}`)
        .join(" | ")

      if (postStatus === "failed" && item.attempts < MAX_ATTEMPTS) {
        const nextAttemptAt = retryDate(item.attempts)
        await prisma.$transaction([
          prisma.postingBatchItem.update({
            where: { id: item.id },
            data: {
              status: "pending",
              scheduledAt: nextAttemptAt,
              processingStartedAt: null,
              lastError: message || "Falha temporária; nova tentativa agendada.",
            },
          }),
          prisma.post.update({
            where: { id: item.post.id },
            data: { status: "scheduled", publishedAt: null },
          }),
        ])
        processed.push({ itemId: item.id, status: "retrying", error: message })
      } else {
        const itemStatus =
          postStatus === "published"
            ? "published"
            : postStatus === "partial"
              ? "partial"
              : "failed"
        await prisma.postingBatchItem.update({
          where: { id: item.id },
          data: {
            status: itemStatus,
            processedAt: new Date(),
            processingStartedAt: null,
            lastError: message || null,
          },
        })
        processed.push({ itemId: item.id, status: itemStatus, error: message })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao processar fila"
      if (item.attempts < MAX_ATTEMPTS) {
        await prisma.$transaction([
          prisma.postingBatchItem.update({
            where: { id: item.id },
            data: {
              status: "pending",
              scheduledAt: retryDate(item.attempts),
              processingStartedAt: null,
              lastError: message,
            },
          }),
          prisma.post.update({
            where: { id: item.post.id },
            data: { status: "scheduled" },
          }),
        ])
        processed.push({ itemId: item.id, status: "retrying", error: message })
      } else {
        await prisma.$transaction([
          prisma.postingBatchItem.update({
            where: { id: item.id },
            data: {
              status: "failed",
              processedAt: new Date(),
              processingStartedAt: null,
              lastError: message,
            },
          }),
          prisma.post.update({
            where: { id: item.post.id },
            data: { status: "failed" },
          }),
        ])
        processed.push({ itemId: item.id, status: "failed", error: message })
      }
    }

    await refreshBatchStats(item.batchId)
    console.info("[queue] Item finished", processed[processed.length - 1])
  }

  return {
    checkedAt: new Date().toISOString(),
    due: dueItems.length,
    processed,
  }
}
