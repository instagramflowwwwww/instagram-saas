import { Prisma } from "@prisma/client"
import { ADMIN_EMAILS } from "@/lib/account-access"
import {
  isInstagramAccountUsable,
  maintainInstagramAccounts,
} from "@/lib/instagram-account-lifecycle"
import { publishExistingPost } from "@/lib/instagram-publisher"
import { prisma } from "@/lib/prisma"

const MAX_ITEM_ATTEMPTS = 3
const STUCK_AFTER_MS = 3 * 60 * 1000
const ACCOUNT_CHUNK_SIZE = 4
const OLD_CANDIDATE_WINDOW = 48
const RECENT_CANDIDATE_WINDOW = 120
const NEAR_DUE_CANDIDATE_WINDOW = 200
const NEAR_SCHEDULE_WINDOW_MS = 90 * 60 * 1000
const RECENT_BATCH_WINDOW_MS = 6 * 60 * 60 * 1000

type ProcessedQueueItem = {
  itemId: string
  status: string
  error?: string
  remainingAccounts?: number
}

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

async function processCandidate(candidateId: string): Promise<ProcessedQueueItem | null> {
  const claim = await prisma.postingBatchItem.updateMany({
    where: { id: candidateId, status: "pending" },
    data: {
      status: "processing",
      processingStartedAt: new Date(),
    },
  })
  if (claim.count === 0) return null

  console.info("[queue] Claiming item", { itemId: candidateId })

  const item = await prisma.postingBatchItem.findUnique({
    where: { id: candidateId },
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
    return null
  }

  // Item com conta própria publica só nela; sem conta, vale o lote inteiro.
  const targetAccountIds = item.instagramAccountId
    ? [item.instagramAccountId]
    : item.batch.accounts.map((account) => account.instagramAccountId)

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
      return { itemId: item.id, status }
    }

    // Cada trabalho executa no máximo quatro contas por ciclo. Isso mantém a
    // Function curta e permite que outros usuários recebam tempo de fila no
    // mesmo cron sem um lote grande monopolizar o executor.
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

    // Limite diário de publicação da própria Meta (25 posts/24h por conta):
    // não é falha da conta, é questão de esperar a cota liberar. Sem este
    // tratamento, o log de erro já gravado marca a conta como "processada"
    // e o item finaliza como falho de vez — toda rodada seguinte do mesmo
    // dia falharia igual, e uma conta que só publicou parte do previsto
    // nunca mais tentaria de novo. Em vez disso, apaga o log de erro desta
    // tentativa (senão a próxima nem chegaria a rodar) e reagenda o item
    // para quando a Meta libera a cota.
    const quotaLimited = result.results.filter(
      (entry) => entry.status === "error" && entry.retryAfterMs
    )
    if (quotaLimited.length > 0) {
      const retryAfterMs = Math.max(
        ...quotaLimited.map((entry) => entry.retryAfterMs || 0)
      )
      await prisma.postLog.deleteMany({
        where: {
          postId: item.post.id,
          instagramAccountId: { in: quotaLimited.map((entry) => entry.accountId) },
          status: "error",
        },
      })
      await prisma.$transaction([
        prisma.postingBatchItem.update({
          where: { id: item.id },
          data: {
            status: "pending",
            scheduledAt: new Date(Date.now() + retryAfterMs),
            processingStartedAt: null,
            lastError: "Limite diário de publicação da Meta atingido para esta conta. Nova tentativa agendada automaticamente.",
          },
        }),
        prisma.post.update({
          where: { id: item.post.id },
          data: { status: "scheduled" },
        }),
      ])
      await refreshBatchStats(item.batchId)
      return {
        itemId: item.id,
        status: "continuing",
        error: message || undefined,
        remainingAccounts: quotaLimited.length,
      }
    }

    const after = await getProgress(item.post.id, targetAccountIds)

    if (after.remainingIds.length > 0) {
      await prisma.$transaction([
        prisma.postingBatchItem.update({
          where: { id: item.id },
          data: {
            status: "pending",
            // Não altera o horário original. No próximo minuto o item continua
            // elegível, mas a seleção justa pode dar a vez a outro usuário.
            processingStartedAt: null,
            lastError: message || null,
          },
        }),
        prisma.post.update({
          where: { id: item.post.id },
          data: { status: "scheduled" },
        }),
      ])

      await refreshBatchStats(item.batchId)
      return {
        itemId: item.id,
        status: "continuing",
        error: message || undefined,
        remainingAccounts: after.remainingIds.length,
      }
    }

    const status = await finalizeItem({
      itemId: item.id,
      batchId: item.batchId,
      postId: item.post.id,
      targetCount: targetAccountIds.length,
      successCount: after.successCount,
      lastError: message || null,
    })
    return { itemId: item.id, status, error: message || undefined }
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
      await refreshBatchStats(item.batchId)
      return { itemId: item.id, status: "retrying", error: message }
    }

    const progress = await getProgress(item.post.id, targetAccountIds)
    const status = await finalizeItem({
      itemId: item.id,
      batchId: item.batchId,
      postId: item.post.id,
      targetCount: targetAccountIds.length,
      successCount: progress.successCount,
      lastError: message,
    })
    return { itemId: item.id, status, error: message }
  }
}

export async function processDueQueue(options: {
  userId?: string
  limit?: number
} = {}) {
  await maintainInstagramAccounts(options.userId)
  await recoverStuckItems(options.userId)

  const requestedLimit = Math.min(Math.max(options.limit || 1, 1), 4)
  const now = new Date()
  const nearScheduleCutoff = new Date(now.getTime() - NEAR_SCHEDULE_WINDOW_MS)
  const recentBatchCutoff = new Date(now.getTime() - RECENT_BATCH_WINDOW_MS)

  const baseWhere: Prisma.PostingBatchItemWhereInput = {
    status: "pending",
    scheduledAt: { lte: now },
    batch: {
      status: { in: ["scheduled", "processing"] },
      ...(options.userId ? { userId: options.userId } : {}),
      user: {
        OR: [
          { email: { in: ADMIN_EMAILS } },
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
  }

  const candidateSelect = {
    id: true,
    batchId: true,
    postId: true,
    scheduledAt: true,
    position: true,
    instagramAccountId: true,
    post: {
      select: {
        scheduledAt: true,
      },
    },
    batch: {
      select: {
        userId: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { accounts: true } },
      },
    },
  } as const

  // Três janelas evitam que milhares de itens atrasados escondam uma mídia
  // que acabou de chegar ao horário: backlog antigo, vencidos recentes e uma
  // janela dedicada aos horários próximos do momento atual.
  const [oldestDue, recentDue, nearDue, processingRows] = await Promise.all([
    prisma.postingBatchItem.findMany({
      where: baseWhere,
      orderBy: [{ scheduledAt: "asc" }, { position: "asc" }],
      select: candidateSelect,
      take: OLD_CANDIDATE_WINDOW,
    }),
    prisma.postingBatchItem.findMany({
      where: baseWhere,
      orderBy: [{ scheduledAt: "desc" }, { position: "asc" }],
      select: candidateSelect,
      take: RECENT_CANDIDATE_WINDOW,
    }),
    prisma.postingBatchItem.findMany({
      where: {
        ...baseWhere,
        scheduledAt: { gte: nearScheduleCutoff, lte: now },
      },
      orderBy: [{ scheduledAt: "asc" }, { position: "asc" }],
      select: candidateSelect,
      take: NEAR_DUE_CANDIDATE_WINDOW,
    }),
    prisma.postingBatchItem.findMany({
      where: {
        status: "processing",
        batch: {
          status: { not: "cancelled" },
          ...(options.userId ? { userId: options.userId } : {}),
        },
      },
      select: {
        batch: { select: { userId: true } },
      },
      take: 200,
    }),
  ])

  const busyUserIds = new Set(processingRows.map((row) => row.batch.userId))

  const dueCandidateMap = new Map<string, (typeof oldestDue)[number]>()
  for (const candidate of [...oldestDue, ...recentDue, ...nearDue]) {
    if (!busyUserIds.has(candidate.batch.userId)) {
      dueCandidateMap.set(candidate.id, candidate)
    }
  }
  const dueCandidates = Array.from(dueCandidateMap.values())

  const candidatePostIds = Array.from(
    new Set(
      dueCandidates
        .map((candidate) => candidate.postId)
        .filter((postId): postId is string => Boolean(postId))
    )
  )

  const candidateUserIds = Array.from(
    new Set(dueCandidates.map((candidate) => candidate.batch.userId))
  )

  const [progressLogs, userActivityRows] = await Promise.all([
    candidatePostIds.length > 0
      ? prisma.postLog.findMany({
          where: {
            postId: { in: candidatePostIds },
            status: { in: ["success", "error"] },
          },
          select: { postId: true, instagramAccountId: true },
        })
      : Promise.resolve([]),
    candidateUserIds.length > 0
      ? prisma.postingBatch.groupBy({
          by: ["userId"],
          where: {
            userId: { in: candidateUserIds },
            status: { in: ["scheduled", "processing"] },
          },
          _max: { updatedAt: true },
        })
      : Promise.resolve([]),
  ])

  const processedByPost = new Map<string, Set<string>>()
  for (const log of progressLogs) {
    const set = processedByPost.get(log.postId) || new Set<string>()
    set.add(log.instagramAccountId)
    processedByPost.set(log.postId, set)
  }

  const lastServedByUser = new Map<string, Date>()
  for (const row of userActivityRows) {
    if (row._max.updatedAt) lastServedByUser.set(row.userId, row._max.updatedAt)
  }

  const enrichedCandidates = dueCandidates.map((candidate) => {
    const totalAccounts = candidate.batch._count.accounts
    const processedAccounts = candidate.postId
      ? processedByPost.get(candidate.postId)?.size || 0
      : 0
    const remainingAccounts = Math.max(totalAccounts - processedAccounts, 0)
    const intendedScheduledAt = candidate.post?.scheduledAt || candidate.scheduledAt

    return {
      ...candidate,
      intendedScheduledAt,
      remainingAccounts,
      quick: remainingAccounts <= ACCOUNT_CHUNK_SIZE,
      nearSchedule: intendedScheduledAt >= nearScheduleCutoff,
      recentBatch: candidate.batch.createdAt >= recentBatchCutoff,
      userLastServedAt:
        lastServedByUser.get(candidate.batch.userId) || new Date(0),
    }
  })

  // Dentro da mesma sequência, sempre considera primeiro o item mais antigo
  // ainda vencido. Isso impede uma mídia das 00:01 de passar na frente da
  // mídia das 23:41 da mesma sequência.
  const bestPerBatch = new Map<string, (typeof enrichedCandidates)[number]>()
  for (const candidate of enrichedCandidates) {
    const current = bestPerBatch.get(candidate.batchId)
    if (
      !current ||
      candidate.intendedScheduledAt < current.intendedScheduledAt ||
      (candidate.intendedScheduledAt.getTime() === current.intendedScheduledAt.getTime() &&
        candidate.position < current.position)
    ) {
      bestPerBatch.set(candidate.batchId, candidate)
    }
  }

  function compareUserCandidate(
    a: (typeof enrichedCandidates)[number],
    b: (typeof enrichedCandidates)[number]
  ) {
    // Horários dos últimos 90 minutos têm prioridade sobre backlog histórico.
    if (a.nearSchedule !== b.nearSchedule) return a.nearSchedule ? -1 : 1

    if (a.nearSchedule && b.nearSchedule) {
      const bySchedule =
        a.intendedScheduledAt.getTime() - b.intendedScheduledAt.getTime()
      if (bySchedule !== 0) return bySchedule
    }

    // Uma sequência criada recentemente também não deve ficar presa atrás de
    // lotes antigos do mesmo usuário.
    if (a.recentBatch !== b.recentBatch) return a.recentBatch ? -1 : 1

    if (a.quick !== b.quick) return a.quick ? -1 : 1

    const bySchedule =
      a.intendedScheduledAt.getTime() - b.intendedScheduledAt.getTime()
    if (bySchedule !== 0) return bySchedule
    return a.position - b.position
  }

  // Um item do modo "vídeo por conta" representa só UMA conta — diferente de
  // um item comum, que já publica várias contas por dentro (em fatias de
  // ACCOUNT_CHUNK_SIZE, a cada ciclo). Se cada item por conta ocupasse
  // sozinho o único slot do usuário, uma rodada de 70 contas levaria 70
  // execuções (70 minutos) só para começar a próxima rodada — e ela nem
  // teria terminado quando a próxima já estivesse vencendo. Por isso, quando
  // o representante da batch é um item por conta, o slot do usuário processa
  // junto todos os outros itens da MESMA rodada (mesmo horário pretendido),
  // até ACCOUNT_CHUNK_SIZE por execução — igual ao que um item comum já faz
  // internamente.
  const bestGroupPerBatch = new Map<string, (typeof enrichedCandidates)[number][]>()
  for (const [batchId, representative] of Array.from(bestPerBatch.entries())) {
    if (!representative.instagramAccountId) {
      bestGroupPerBatch.set(batchId, [representative])
      continue
    }

    const siblings = enrichedCandidates.filter(
      (candidate) =>
        candidate.id !== representative.id &&
        candidate.batchId === batchId &&
        candidate.instagramAccountId &&
        candidate.intendedScheduledAt.getTime() ===
          representative.intendedScheduledAt.getTime()
    )

    bestGroupPerBatch.set(
      batchId,
      [representative, ...siblings].slice(0, ACCOUNT_CHUNK_SIZE)
    )
  }

  // Um usuário só ocupa um slot por execução. Assim três usuários podem ser
  // processados em paralelo sem um único cliente monopolizar a fila global.
  const bestGroupPerUser = new Map<string, (typeof enrichedCandidates)[number][]>()
  for (const group of Array.from(bestGroupPerBatch.values())) {
    const representative = group[0]
    const userId = representative.batch.userId
    const currentGroup = bestGroupPerUser.get(userId)
    if (!currentGroup || compareUserCandidate(representative, currentGroup[0]) < 0) {
      bestGroupPerUser.set(userId, group)
    }
  }

  const prioritizedGroups = Array.from(bestGroupPerUser.values()).sort((groupA, groupB) => {
    const a = groupA[0]
    const b = groupB[0]

    if (a.nearSchedule !== b.nearSchedule) return a.nearSchedule ? -1 : 1

    if (a.nearSchedule && b.nearSchedule) {
      const bySchedule =
        a.intendedScheduledAt.getTime() - b.intendedScheduledAt.getTime()
      if (bySchedule !== 0) return bySchedule
    }

    if (a.recentBatch !== b.recentBatch) return a.recentBatch ? -1 : 1
    if (a.quick !== b.quick) return a.quick ? -1 : 1

    // Para backlog, quem foi atendido há mais tempo recebe a próxima vez.
    const byLastServed =
      a.userLastServedAt.getTime() - b.userLastServedAt.getTime()
    if (byLastServed !== 0) return byLastServed

    return a.intendedScheduledAt.getTime() - b.intendedScheduledAt.getTime()
  })

  const dueItems = prioritizedGroups.slice(0, requestedLimit).flat()

  console.info("[queue] Due items found", {
    userId: options.userId || "all",
    oldestCandidates: oldestDue.length,
    recentCandidates: recentDue.length,
    nearCandidates: nearDue.length,
    busyUsers: busyUserIds.size,
    candidates: dueCandidates.length,
    candidateUsers: bestGroupPerUser.size,
    count: dueItems.length,
    selected: dueItems.map((item) => ({
      itemId: item.id,
      batchId: item.batchId,
      ownerUserId: item.batch.userId,
      remainingAccounts: item.remainingAccounts,
      quick: item.quick,
      nearSchedule: item.nearSchedule,
      eligibleAt: item.scheduledAt.toISOString(),
      intendedScheduledAt: item.intendedScheduledAt.toISOString(),
    })),
  })

  // Diagnóstico quando a fila manual do próprio usuário não encontra nada,
  // embora o painel ainda mostre itens pendentes.
  if (options.userId && dueItems.length === 0) {
    const pendingDiagnostic = await prisma.postingBatchItem.findMany({
      where: {
        status: "pending",
        batch: { userId: options.userId },
      },
      orderBy: { scheduledAt: "asc" },
      take: 5,
      select: {
        id: true,
        scheduledAt: true,
        post: { select: { scheduledAt: true } },
        batch: {
          select: {
            status: true,
            user: {
              select: {
                email: true,
                accessStatus: true,
                accessExpiresAt: true,
              },
            },
          },
        },
      },
    })

    if (pendingDiagnostic.length > 0) {
      console.warn("[queue] Pending items excluded from due selection", {
        userId: options.userId,
        now: now.toISOString(),
        busy: busyUserIds.has(options.userId),
        items: pendingDiagnostic.map((item) => ({
          itemId: item.id,
          scheduledAt: item.scheduledAt.toISOString(),
          intendedScheduledAt:
            item.post?.scheduledAt?.toISOString() || item.scheduledAt.toISOString(),
          batchStatus: item.batch.status,
          userEmail: item.batch.user.email,
          accessStatus: item.batch.user.accessStatus,
          accessExpiresAt: item.batch.user.accessExpiresAt?.toISOString() || null,
          alreadyDue: item.scheduledAt <= now,
        })),
      })
    }
  }

  // dueItems já veio agrupado por rodada quando aplicável: na fila global,
  // cada slot pertence a um usuário diferente (podendo ter vários itens, se
  // for uma rodada por conta); na fila manual do dashboard, todos os itens
  // são do mesmo usuário. Nos dois casos é seguro processar em paralelo —
  // contas diferentes usam tokens diferentes e não compartilham estado.
  const rawProcessed =
    dueItems.length === 0
      ? []
      : await Promise.all(dueItems.map((candidate) => processCandidate(candidate.id)))

  const processed = rawProcessed.filter(
    (entry): entry is ProcessedQueueItem => Boolean(entry)
  )

  for (const entry of processed) {
    console.info("[queue] Item finished", entry)
  }

  return {
    checkedAt: new Date().toISOString(),
    due: dueItems.length,
    processed,
  }
}
