import { ADMIN_EMAIL } from "@/lib/account-access"
import {
  isInstagramAccountUsable,
  maintainInstagramAccounts,
} from "@/lib/instagram-account-lifecycle"
import { publishExistingPost } from "@/lib/instagram-publisher"
import { prisma } from "@/lib/prisma"

const MAX_ITEM_ATTEMPTS = 3
const STUCK_AFTER_MS = 3 * 60 * 1000
const ACCOUNT_CHUNK_SIZE = 4
const CONTINUE_DELAY_MS = 65_000
const DUE_CANDIDATE_WINDOW = 24

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
          lastError: "Processamento anterior interrompido; retomado automaticamente.",
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
  const delayMinutes = Math.max(2, Math.min(10, attempts * 2))
  return new Date(Date.now() + delayMinutes * 60 * 1000)
}

async function getProgress(postId: string, targetAccountIds: string[]) {
  const [accounts, logs] = await Promise.all([
    prisma.instagramAccount.findMany({
      where: { id: { in: targetAccountIds } },
      select: {
        id: true,
        connectionType: true,
        isActive: true,
        accessToken: true,
        tokenExpiresAt: true,
        appConfigId: true,
      },
    }),
    prisma.postLog.findMany({
      where: {
        postId,
        instagramAccountId: { in: targetAccountIds },
        status: { in: ["success", "error"] },
      },
      orderBy: { createdAt: "desc" },
      select: { instagramAccountId: true, status: true },
    }),
  ])

  const processedIds = new Set<string>()
  const successIds = new Set<string>()
  for (const log of logs) {
    if (processedIds.has(log.instagramAccountId)) continue
    processedIds.add(log.instagramAccountId)
    if (log.status === "success") successIds.add(log.instagramAccountId)
  }

  const usableIds = accounts
    .filter((account) => isInstagramAccountUsable(account))
    .map((account) => account.id)
  const usableSet = new Set(usableIds)

  const remainingIds = targetAccountIds.filter(
    (accountId) => usableSet.has(accountId) && !processedIds.has(accountId)
  )

  return {
    successCount: successIds.size,
    processedCount: processedIds.size,
    remainingIds,
    unavailableCount: targetAccountIds.filter((id) => !usableSet.has(id)).length,
  }
}

async function finalizeItem(params: {
  itemId: string
  batchId: string
  postId: string
  targetCount: number
  successCount: number
  lastError?: string | null
}) {
  const itemStatus =
    params.successCount === params.targetCount
      ? "published"
      : params.successCount > 0
        ? "partial"
        : "failed"

  const postStatus = itemStatus === "published" ? "published" : itemStatus

  await prisma.$transaction([
    prisma.postingBatchItem.update({
      where: { id: params.itemId },
      data: {
        status: itemStatus,
        processedAt: new Date(),
        processingStartedAt: null,
        lastError: params.lastError || null,
      },
    }),
    prisma.post.update({
      where: { id: params.postId },
      data: {
        status: postStatus,
        publishedAt: params.successCount > 0 ? new Date() : null,
      },
    }),
  ])

  await refreshBatchStats(params.batchId)
  return itemStatus
}

export async function processDueQueue(options: {
  userId?: string
  limit?: number
} = {}) {
  await maintainInstagramAccounts(options.userId)
  await recoverStuckItems(options.userId)

  const requestedLimit = Math.min(Math.max(options.limit || 1, 1), 4)
  const now = new Date()

  // Busca uma janela maior de itens vencidos para que um lote grande antigo
  // não bloqueie uma publicação pequena que acabou de chegar no horário.
  // A execução continua processando poucos itens por vez; só a escolha fica
  // mais inteligente.
  const dueCandidates = await prisma.postingBatchItem.findMany({
    where: {
      status: "pending",
      scheduledAt: { lte: now },
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
                { accessExpiresAt: { gt: now } },
              ],
            },
          ],
        },
      },
    },
    orderBy: [{ scheduledAt: "asc" }, { position: "asc" }],
    select: {
      id: true,
      postId: true,
      scheduledAt: true,
      position: true,
      batch: {
        select: {
          _count: { select: { accounts: true } },
        },
      },
    },
    take: DUE_CANDIDATE_WINDOW,
  })

  const candidatePostIds = Array.from(
    new Set(
      dueCandidates
        .map((candidate) => candidate.postId)
        .filter((postId): postId is string => Boolean(postId))
    )
  )

  const progressLogs =
    candidatePostIds.length > 0
      ? await prisma.postLog.findMany({
          where: {
            postId: { in: candidatePostIds },
            status: { in: ["success", "error"] },
          },
          select: { postId: true, instagramAccountId: true },
        })
      : []

  const processedByPost = new Map<string, Set<string>>()
  for (const log of progressLogs) {
    const set = processedByPost.get(log.postId) || new Set<string>()
    set.add(log.instagramAccountId)
    processedByPost.set(log.postId, set)
  }

  const prioritizedCandidates = dueCandidates
    .map((candidate) => {
      const totalAccounts = candidate.batch._count.accounts
      const processedAccounts = candidate.postId
        ? processedByPost.get(candidate.postId)?.size || 0
        : 0
      const remainingAccounts = Math.max(totalAccounts - processedAccounts, 0)

      return {
        ...candidate,
        remainingAccounts,
        // Itens que conseguem terminar em um único chunk têm prioridade.
        // Isso evita que um agendamento de 1-4 contas fique atrás de um lote
        // antigo com dezenas de contas.
        quick: remainingAccounts <= ACCOUNT_CHUNK_SIZE,
      }
    })
    .sort((a, b) => {
      if (a.quick !== b.quick) return a.quick ? -1 : 1

      const bySchedule = a.scheduledAt.getTime() - b.scheduledAt.getTime()
      if (bySchedule !== 0) return bySchedule
      return a.position - b.position
    })

  const dueItems = prioritizedCandidates.slice(0, requestedLimit)

  console.info("[queue] Due items found", {
    userId: options.userId || "all",
    candidates: dueCandidates.length,
    count: dueItems.length,
    selected: dueItems.map((item) => ({
      itemId: item.id,
      remainingAccounts: item.remainingAccounts,
      quick: item.quick,
      scheduledAt: item.scheduledAt.toISOString(),
    })),
  })

  const processed: Array<{
    itemId: string
    status: string
    error?: string
    remainingAccounts?: number
  }> = []

  for (const candidate of dueItems) {
    const claim = await prisma.postingBatchItem.updateMany({
      where: { id: candidate.id, status: "pending" },
      data: {
        status: "processing",
        processingStartedAt: new Date(),
      },
    })
    if (claim.count === 0) continue

    console.info("[queue] Claiming item", { itemId: candidate.id })

    const item = await prisma.postingBatchItem.findUnique({
      where: { id: candidate.id },
      include: {
        batch: {
          include: {
            accounts: {
              select: { instagramAccountId: true },
            },
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

    const targetAccountIds = item.batch.accounts.map(
      (account) => account.instagramAccountId
    )

    try {
      const before = await getProgress(item.post.id, targetAccountIds)

      if (before.remainingIds.length === 0) {
        const status = await finalizeItem({
          itemId: item.id,
          batchId: item.batchId,
          postId: item.post.id,
          targetCount: targetAccountIds.length,
          successCount: before.successCount,
          lastError:
            before.successCount < targetAccountIds.length
              ? `${targetAccountIds.length - before.successCount} conta(s) não concluíram esta publicação.`
              : null,
        })
        processed.push({ itemId: item.id, status })
        continue
      }

      const chunkIds = before.remainingIds.slice(0, ACCOUNT_CHUNK_SIZE)
      const result = await publishExistingPost({
        postId: item.post.id,
        userId: item.batch.userId,
        accountIds: chunkIds,
      })

      const message = result.results
        .filter((entry) => entry.status === "error")
        .map((entry) => `@${entry.username}: ${entry.error || "Erro"}`)
        .join(" | ")

      const after = await getProgress(item.post.id, targetAccountIds)

      if (after.remainingIds.length > 0) {
        await prisma.$transaction([
          prisma.postingBatchItem.update({
            where: { id: item.id },
            data: {
              status: "pending",
              scheduledAt: new Date(Date.now() + CONTINUE_DELAY_MS),
              processingStartedAt: null,
              lastError: message || null,
            },
          }),
          prisma.post.update({
            where: { id: item.post.id },
            data: { status: "scheduled" },
          }),
        ])

        processed.push({
          itemId: item.id,
          status: "continuing",
          error: message || undefined,
          remainingAccounts: after.remainingIds.length,
        })
        await refreshBatchStats(item.batchId)
        continue
      }

      const status = await finalizeItem({
        itemId: item.id,
        batchId: item.batchId,
        postId: item.post.id,
        targetCount: targetAccountIds.length,
        successCount: after.successCount,
        lastError: message || null,
      })
      processed.push({ itemId: item.id, status, error: message || undefined })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao processar fila"
      const nextAttempts = item.attempts + 1

      if (nextAttempts < MAX_ITEM_ATTEMPTS) {
        await prisma.$transaction([
          prisma.postingBatchItem.update({
            where: { id: item.id },
            data: {
              status: "pending",
              attempts: nextAttempts,
              scheduledAt: retryDate(nextAttempts),
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
        const progress = await getProgress(item.post.id, targetAccountIds)
        const status = await finalizeItem({
          itemId: item.id,
          batchId: item.batchId,
          postId: item.post.id,
          targetCount: targetAccountIds.length,
          successCount: progress.successCount,
          lastError: message,
        })
        processed.push({ itemId: item.id, status, error: message })
      }
    }

    console.info("[queue] Item finished", processed[processed.length - 1])
  }

  return {
    checkedAt: new Date().toISOString(),
    due: dueItems.length,
    processed,
  }
}
