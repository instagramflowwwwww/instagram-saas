import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getInstagramRedirectUri } from "@/lib/instagram-meta"
import { prisma } from "@/lib/prisma"
import { encryptValue } from "@/lib/secure-store"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const apps = await prisma.instagramApp.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      metaAppId: true,
      name: true,
      lastValidatedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: { accounts: true },
      },
    },
  })

  const serializedApps = apps.map((app) => ({
    id: app.id,
    appId: app.metaAppId,
    name: app.name || null,
    secretConfigured: true,
    lastValidatedAt: app.lastValidatedAt,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
    accountsCount: app._count.accounts,
  }))

  const firstApp = serializedApps[0] || null
  const accountsCount = serializedApps.reduce(
    (total, app) => total + app.accountsCount,
    0
  )

  return NextResponse.json({
    configured: serializedApps.length > 0,
    apps: serializedApps,
    appsCount: serializedApps.length,
    accountsCount,
    redirectUri: getInstagramRedirectUri(request),
    appId: firstApp?.appId || "",
    secretConfigured: Boolean(firstApp),
    lastValidatedAt: firstApp?.lastValidatedAt || null,
    createdAt: firstApp?.createdAt || null,
    updatedAt: firstApp?.updatedAt || null,
  })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const configId = String(body.configId || "").trim()
  const appId = String(body.appId || "").trim()
  const appSecret = String(body.appSecret || "").trim()
  const name = String(body.name || "").trim().slice(0, 50) || null

  if (!/^\d{8,}$/.test(appId)) {
    return NextResponse.json(
      { error: "Informe o Instagram App ID correto, usando somente números." },
      { status: 400 }
    )
  }

  const existing = configId
    ? await prisma.instagramApp.findFirst({
        where: { id: configId, userId: session.user.id },
      })
    : null

  if (configId && !existing) {
    return NextResponse.json({ error: "App Meta não encontrado." }, { status: 404 })
  }

  if (!existing && appSecret.length < 8) {
    return NextResponse.json(
      { error: "Informe o Instagram App Secret." },
      { status: 400 }
    )
  }

  const duplicate = await prisma.instagramApp.findFirst({
    where: {
      userId: session.user.id,
      metaAppId: appId,
      ...(existing ? { id: { not: existing.id } } : {}),
    },
    select: { id: true },
  })

  if (duplicate) {
    return NextResponse.json(
      { error: "Este Instagram App ID já está cadastrado nesta conta." },
      { status: 409 }
    )
  }

  if (existing && existing.metaAppId !== appId) {
    const accountsCount = await prisma.instagramAccount.count({
      where: { userId: session.user.id, appConfigId: existing.id },
    })

    if (accountsCount > 0) {
      return NextResponse.json(
        { error: "Remova as contas conectadas por este app antes de trocar o Instagram App ID." },
        { status: 409 }
      )
    }
  }

  const app = existing
    ? await prisma.instagramApp.update({
        where: { id: existing.id },
        data: {
          metaAppId: appId,
          name,
          ...(appSecret ? { appSecretEncrypted: encryptValue(appSecret) } : {}),
          ...(existing.metaAppId !== appId ? { lastValidatedAt: null } : {}),
        },
        select: { id: true, metaAppId: true, name: true, lastValidatedAt: true, updatedAt: true },
      })
    : await prisma.instagramApp.create({
        data: {
          userId: session.user.id,
          metaAppId: appId,
          name,
          appSecretEncrypted: encryptValue(appSecret),
        },
        select: { id: true, metaAppId: true, name: true, lastValidatedAt: true, updatedAt: true },
      })

  return NextResponse.json({
    success: true,
    configId: app.id,
    appId: app.metaAppId,
    name: app.name,
    lastValidatedAt: app.lastValidatedAt,
    updatedAt: app.updatedAt,
    redirectUri: getInstagramRedirectUri(request),
  })
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const requestedId = String(body.configId || body.id || "").trim()

  let app = requestedId
    ? await prisma.instagramApp.findFirst({
        where: { id: requestedId, userId: session.user.id },
        select: { id: true },
      })
    : null

  if (!requestedId) {
    const apps = await prisma.instagramApp.findMany({
      where: { userId: session.user.id },
      select: { id: true },
      take: 2,
    })
    if (apps.length === 1) app = apps[0]
  }

  if (!app) {
    return requestedId
      ? NextResponse.json({ error: "App Meta não encontrado." }, { status: 404 })
      : NextResponse.json({ success: true })
  }

  const accountsCount = await prisma.instagramAccount.count({
    where: { userId: session.user.id, appConfigId: app.id },
  })

  if (accountsCount > 0) {
    return NextResponse.json(
      { error: "Remova as contas conectadas por este app antes de excluí-lo." },
      { status: 409 }
    )
  }

  await prisma.instagramApp.delete({ where: { id: app.id } })

  return NextResponse.json({ success: true })
}
