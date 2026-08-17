import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import {
  INSTAGRAM_DISCONNECTED_CONNECTION,
  INSTAGRAM_OFFICIAL_CONNECTION,
  instagramDisconnectDeadline,
  requiresInstagramReconnect,
} from "@/lib/instagram-account-lifecycle"
import { syncInstagramAccountProfiles } from "@/lib/instagram-account-sync"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const requestUrl = new URL(request.url)
  const shouldSync = requestUrl.searchParams.get("sync") === "1"
  const syncErrors = new Map<string, string>()

  if (shouldSync) {
    const syncResult = await syncInstagramAccountProfiles({
      userId: session.user.id,
      force: true,
      limit: 100,
      concurrency: 4,
    })

    syncResult.results.forEach((item) => {
      if (item.error) syncErrors.set(item.accountId, item.error)
    })
  }

  // Sem ?sync=1 este endpoint faz somente leitura no PostgreSQL. Assim telas
  // que precisam apenas listar contas não ficam esperando Meta/proxy.
  const accounts = await prisma.instagramAccount.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      username: true,
      name: true,
      accountType: true,
      profilePicture: true,
      followerCount: true,
      mediaCount: true,
      connectionType: true,
      isActive: true,
      accessToken: true,
      tokenExpiresAt: true,
      appConfigId: true,
      proxyAssignedAt: true,
      lastActiveAt: true,
      createdAt: true,
      appConfig: {
        select: { metaAppId: true },
      },
    },
  })

  const serializedAccounts = accounts.map((account) => {
    const reconnect = requiresInstagramReconnect(account)
    const autoDeleteAt = instagramDisconnectDeadline(account)
    const exposedConnectionType =
      account.connectionType === INSTAGRAM_DISCONNECTED_CONNECTION
        ? INSTAGRAM_OFFICIAL_CONNECTION
        : account.connectionType

    return {
      id: account.id,
      username: account.username,
      name: account.name,
      accountType: account.accountType,
      profilePicture: account.profilePicture,
      followerCount: account.followerCount,
      mediaCount: account.mediaCount,
      connectionType: exposedConnectionType,
      isActive: account.isActive,
      tokenExpiresAt: account.tokenExpiresAt,
      proxyAssignedAt: account.proxyAssignedAt,
      hasAssignedProxy: Boolean(account.proxyAssignedAt),
      lastActiveAt: account.lastActiveAt,
      createdAt: account.createdAt,
      appConfigId: account.appConfigId || null,
      appId: account.appConfig?.metaAppId || null,
      requiresReconnect: reconnect,
      autoDeleteAt,
      syncError: syncErrors.get(account.id) || null,
    }
  })

  return NextResponse.json(serializedAccounts, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  })
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
