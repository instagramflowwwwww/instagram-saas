import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import {
  INSTAGRAM_DISCONNECTED_CONNECTION,
  INSTAGRAM_OFFICIAL_CONNECTION,
  instagramDisconnectDeadline,
  isInstagramAccountUsable,
  isInstagramDisconnectError,
  maintainInstagramAccounts,
  markInstagramAccountDisconnected,
  requiresInstagramReconnect,
} from "@/lib/instagram-account-lifecycle"
import { fetchInstagramProfile, parseMetaCount } from "@/lib/instagram-meta"
import { prisma } from "@/lib/prisma"
import { decryptValue } from "@/lib/secure-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  )

  return results
}

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  await maintainInstagramAccounts(session.user.id)

  const accounts = await prisma.instagramAccount.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      appConfig: {
        select: { metaAppId: true },
      },
    },
  })

  const synchronizedAccounts = await mapWithConcurrency(
    accounts,
    5,
    async (account) => {
      let currentAccount = account
      let syncError: string | null = null

      if (isInstagramAccountUsable(account)) {
        try {
          const accessToken = decryptValue(account.accessToken!)
          const profile = await fetchInstagramProfile(accessToken, account.id)
          const username = String(profile.username || account.username)
          const followerCount = parseMetaCount(profile.followers_count)
          const mediaCount = parseMetaCount(profile.media_count)

          currentAccount = await prisma.instagramAccount.update({
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
              connectionType: INSTAGRAM_OFFICIAL_CONNECTION,
              isActive: true,
              lastActiveAt: new Date(),
            },
            include: {
              appConfig: {
                select: { metaAppId: true },
              },
            },
          })
        } catch (error) {
          syncError =
            error instanceof Error
              ? error.message
              : "Não foi possível atualizar os dados da conta."

          if (isInstagramDisconnectError(error)) {
            const disconnected = await markInstagramAccountDisconnected(account.id)
            currentAccount = {
              ...account,
              ...disconnected,
              appConfig: account.appConfig,
            }
          }
        }
      }

      const reconnect = requiresInstagramReconnect(currentAccount)
      const autoDeleteAt = instagramDisconnectDeadline(currentAccount)
      const exposedConnectionType =
        currentAccount.connectionType === INSTAGRAM_DISCONNECTED_CONNECTION
          ? INSTAGRAM_OFFICIAL_CONNECTION
          : currentAccount.connectionType

      return {
        id: currentAccount.id,
        username: currentAccount.username,
        name: currentAccount.name,
        accountType: currentAccount.accountType,
        profilePicture: currentAccount.profilePicture,
        followerCount: currentAccount.followerCount,
        mediaCount: currentAccount.mediaCount,
        connectionType: exposedConnectionType,
        isActive: currentAccount.isActive,
        tokenExpiresAt: currentAccount.tokenExpiresAt,
        proxyAssignedAt: currentAccount.proxyAssignedAt,
        hasAssignedProxy: Boolean(currentAccount.proxyAssignedAt),
        lastActiveAt: currentAccount.lastActiveAt,
        createdAt: currentAccount.createdAt,
        appId: currentAccount.appConfig?.metaAppId || null,
        requiresReconnect: reconnect,
        autoDeleteAt,
        syncError,
      }
    }
  )

  return NextResponse.json(synchronizedAccounts)
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const id = String(body.id || "")

  if (!id) {
    return NextResponse.json({ error: "Conta inválida" }, { status: 400 })
  }

  const result = await prisma.instagramAccount.deleteMany({
    where: {
      id,
      userId: session.user.id,
    },
  })

  if (result.count === 0) {
    return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
