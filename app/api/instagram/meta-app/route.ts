import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { maintainInstagramAccounts } from "@/lib/instagram-account-lifecycle"
import { getInstagramRedirectUri } from "@/lib/instagram-meta"
import { prisma } from "@/lib/prisma"
import { encryptValue } from "@/lib/secure-store"

export const runtime = "nodejs"

// O commit 0711b61 assumia que InstagramApp.userId era UNIQUE.
// O banco atual compartilhado com a Cloudflare permite mais de um App Meta
// por usuário. Para manter a interface antiga funcionando sem alterar o banco,
// tratamos o App Meta mais antigo como o "app principal" da versão antiga.
async function getLegacyInstagramApp(userId: string) {
  return prisma.instagramApp.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  })
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    await maintainInstagramAccounts(session.user.id)

    const [app, accountsCount] = await Promise.all([
      prisma.instagramApp.findFirst({
        where: { userId: session.user.id },
        orderBy: { createdAt: "asc" },
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
  } catch (error) {
    console.error("Failed to load Instagram Meta App", error)
    return NextResponse.json(
      { error: "Não foi possível carregar a configuração do App Meta." },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const appId = String(body.appId || "").trim()
    const appSecret = String(body.appSecret || "").trim()

    if (!/^\d{8,}$/.test(appId)) {
      return NextResponse.json(
        { error: "Informe o Instagram App ID correto, usando somente números." },
        { status: 400 }
      )
    }

    const existing = await getLegacyInstagramApp(session.user.id)

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

    // NÃO usa upsert por userId. O banco atual não possui UNIQUE(userId),
    // então o ON CONFLICT gerado pelo upsert do commit antigo falha com 42P10.
    const app = existing
      ? await prisma.instagramApp.update({
          where: { id: existing.id },
          data: {
            metaAppId: appId,
            ...(appSecret
              ? { appSecretEncrypted: encryptValue(appSecret) }
              : {}),
            ...(existing.metaAppId !== appId
              ? { lastValidatedAt: null }
              : {}),
          },
          select: {
            metaAppId: true,
            lastValidatedAt: true,
            updatedAt: true,
          },
        })
      : await prisma.instagramApp.create({
          data: {
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
  } catch (error) {
    console.error("Failed to save Instagram Meta App", error)
    return NextResponse.json(
      { error: "Não foi possível salvar o App Meta." },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    const app = await prisma.instagramApp.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
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
  } catch (error) {
    console.error("Failed to delete Instagram Meta App", error)
    return NextResponse.json(
      { error: "Não foi possível excluir o App Meta." },
      { status: 500 }
    )
  }
}
