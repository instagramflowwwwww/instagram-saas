import type { Prisma } from "@prisma/client"
import {
  isInstagramDisconnectError,
  maintainInstagramAccounts,
  markInstagramAccountDisconnected,
} from "@/lib/instagram-account-lifecycle"
import { fetchInstagramProfile, parseMetaCount } from "@/lib/instagram-meta"
import { prisma } from "@/lib/prisma"
import { decryptValue } from "@/lib/secure-store"

type SyncOptions = {
  userId?: string
  force?: boolean
  staleMinutes?: number
  limit?: number
  concurrency?: number
}

export type InstagramAccountSyncItem = {
  accountId: string
  success: boolean
  disconnected: boolean
  error: string | null
}

export type InstagramAccountSyncSummary = {
  selected: number
  synced: number
  failed: number
  disconnected: number
  results: InstagramAccountSyncItem[]
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length)
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(items[index], index)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), items.length) }, () =>
      worker()
    )
  )

  return results
}

function normalizeError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Não foi possível atualizar os dados da conta."
}

export async function syncInstagramAccountProfiles(
  options: SyncOptions = {}
): Promise<InstagramAccountSyncSummary> {
  const now = new Date()
  const staleMinutes = Math.max(5, options.staleMinutes ?? 15)
  const cutoff = new Date(now.getTime() - staleMinutes * 60 * 1000)
  const concurrency = Math.min(5, Math.max(1, options.concurrency ?? 4))
  const limit = Math.min(200, Math.max(1, options.limit ?? 40))

  // A manutenção fica concentrada na sincronização/cron, em vez de rodar em
  // cada tela de leitura do sistema.
  await maintainInstagramAccounts(options.userId)

  const where: Prisma.InstagramAccountWhereInput = {
    ...(options.userId ? { userId: options.userId } : {}),
    connectionType: "official",
    isActive: true,
    accessToken: { not: null },
    appConfigId: { not: null },
    tokenExpiresAt: { gt: now },
    ...(options.force
      ? {}
      : {
          OR: [
            { profileSyncedAt: null },
            { profileSyncedAt: { lte: cutoff } },
          ],
        }),
  }

  const accounts = await prisma.instagramAccount.findMany({
    where,
    select: {
      id: true,
      username: true,
      name: true,
      accountType: true,
      profilePicture: true,
      followerCount: true,
      mediaCount: true,
      accessToken: true,
    },
    orderBy: [
      { profileSyncedAt: { sort: "asc", nulls: "first" } },
      { createdAt: "asc" },
    ],
    take: limit,
  })

  const results = await mapWithConcurrency(
    accounts,
    concurrency,
    async (account): Promise<InstagramAccountSyncItem> => {
      const attemptedAt = new Date()

      try {
        const accessToken = decryptValue(account.accessToken!)
        const profile = await fetchInstagramProfile(accessToken, account.id)
        const username = String(profile.username || account.username)
        const followerCount = parseMetaCount(profile.followers_count)
        const mediaCount = parseMetaCount(profile.media_count)

        await prisma.instagramAccount.update({
          where: { id: account.id },
          data: {
            username: username.toLowerCase(),
            name: profile.name ? String(profile.name) : account.name,
            accountType: profile.account_type
              ? String(profile.account_type)
              : account.accountType,
            profilePicture: profile.profile_picture_url
              ? String(profile.profile_picture_url)
              : account.profilePicture,
            followerCount:
              followerCount === null ? account.followerCount : followerCount,
            mediaCount: mediaCount === null ? account.mediaCount : mediaCount,
            connectionType: "official",
            isActive: true,
            lastActiveAt: attemptedAt,
            profileSyncedAt: attemptedAt,
          },
        })

        return {
          accountId: account.id,
          success: true,
          disconnected: false,
          error: null,
        }
      } catch (error) {
        const disconnected = isInstagramDisconnectError(error)

        if (disconnected) {
          await markInstagramAccountDisconnected(account.id)
        } else {
          // Evita martelar Meta/proxy em todas as execuções do cron quando uma
          // conta apresenta uma falha temporária. Ela volta a ser elegível após
          // a janela de staleMinutes.
          await prisma.instagramAccount
            .update({
              where: { id: account.id },
              data: { profileSyncedAt: attemptedAt },
            })
            .catch(() => undefined)
        }

        return {
          accountId: account.id,
          success: false,
          disconnected,
          error: normalizeError(error),
        }
      }
    }
  )

  return {
    selected: accounts.length,
    synced: results.filter((item) => item.success).length,
    failed: results.filter((item) => !item.success).length,
    disconnected: results.filter((item) => item.disconnected).length,
    results,
  }
}
