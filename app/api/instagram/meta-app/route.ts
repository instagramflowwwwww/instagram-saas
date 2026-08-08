import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { maintainInstagramAccounts } from "@/lib/instagram-account-lifecycle"
import { getInstagramRedirectUri } from "@/lib/instagram-meta"
import { prisma } from "@/lib/prisma"
import { encryptValue } from "@/lib/secure-store"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  await maintainInstagramAccounts(session.user.id)

  const [app, accountsCount] = await Promise.all([
    prisma.instagramApp.findUnique({
      where: { userId: session.user.id },
      select: {
        id: true,
        metaAppId: true,
        lastValidatedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.instagramAccount.count({
      where: {
        userId: session.user.id,
        appConfigId: { not: null },
      },
    }),
  ])

  return NextResponse.json({
    configured: Boolean(app),
    appId: app?.metaAppId || "",
    secretConfigured: Boolean(app),
    lastValidatedAt: app?.lastValidatedAt || null,
    createdAt: app?.createdAt || null,
    updatedAt: app?.updatedAt || null,
    accountsCount,
    redirectUri: getInstagramRedirectUri(request),
  })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const appId = String(body.appId || "").trim()
  const appSecret = String(body.appSecret || "").trim()

  if (!/^\d{8,}$/.test(appId)) {
    return NextResponse.json(
      { error: "Informe o Instagram App ID correto, usando somente números." },
      { status: 400 }
    )
  }

  const existing = await prisma.instagramApp.findUnique({
    where: { userId: session.user.id },
  })

  if (!existing && appSecret.length < 8) {
    return NextResponse.json(
      { error: "Informe o Instagram App Secret." },
      { status: 400 }
    )
  }

  if (existing && existing.metaAppId !== appId) {
    const accountsCount = await prisma.instagramAccount.count({
      where: {
        userId: session.user.id,
        appConfigId: existing.id,
      },
    })

    if (accountsCount > 0) {
      return NextResponse.json(
        {
          error:
            "Remova as contas conectadas pelo app atual antes de trocar o Instagram App ID.",
        },
        { status: 409 }
      )
    }
  }

  const app = await prisma.instagramApp.upsert({
    where: { userId: session.user.id },
    update: {
      metaAppId: appId,
      ...(appSecret
        ? { appSecretEncrypted: encryptValue(appSecret) }
        : {}),
      ...(existing?.metaAppId !== appId ? { lastValidatedAt: null } : {}),
    },
    create: {
      userId: session.user.id,
      metaAppId: appId,
      appSecretEncrypted: encryptValue(appSecret),
    },
    select: {
      metaAppId: true,
      lastValidatedAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({
    success: true,
    appId: app.metaAppId,
    lastValidatedAt: app.lastValidatedAt,
    updatedAt: app.updatedAt,
    redirectUri: getInstagramRedirectUri(request),
  })
}

export async function DELETE() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const app = await prisma.instagramApp.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  if (!app) {
    return NextResponse.json({ success: true })
  }

  const accountsCount = await prisma.instagramAccount.count({
    where: { appConfigId: app.id },
  })

  if (accountsCount > 0) {
    return NextResponse.json(
      { error: "Remova as contas conectadas antes de excluir o App Meta." },
      { status: 409 }
    )
  }

  await prisma.instagramApp.delete({ where: { id: app.id } })

  return NextResponse.json({ success: true })
}
