import { randomBytes } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import {
  getInstagramRedirectUri,
  INSTAGRAM_SCOPES,
} from "@/lib/instagram-meta"
import { prisma } from "@/lib/prisma"
import { sealPayload } from "@/lib/secure-store"

export const runtime = "nodejs"

function redirectToMetaApp(
  request: NextRequest,
  error: string,
  popupMode: boolean
) {
  const url = new URL("/dashboard/meta-app", request.url)
  url.searchParams.set("error", error)
  if (popupMode) {
    url.searchParams.set("oauthPopup", "1")
  }
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const popupMode = request.nextUrl.searchParams.get("popup") === "1"

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const requestedAppConfigId = String(
    request.nextUrl.searchParams.get("appConfigId") || ""
  ).trim()

  let app: { id: string; metaAppId: string } | null = null

  if (requestedAppConfigId) {
    app = await prisma.instagramApp.findFirst({
      where: {
        id: requestedAppConfigId,
        userId: session.user.id,
      },
      select: {
        id: true,
        metaAppId: true,
      },
    })
    if (!app) {
      return redirectToMetaApp(request, "app_not_configured", popupMode)
    }
  } else {
    const apps = await prisma.instagramApp.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        metaAppId: true,
      },
      take: 2,
    })
    if (apps.length === 0) {
      return redirectToMetaApp(request, "app_not_configured", popupMode)
    }
    if (apps.length > 1) {
      return redirectToMetaApp(request, "app_required", popupMode)
    }
    app = apps[0]
  }

  if (!app) {
    return redirectToMetaApp(request, "app_not_configured", popupMode)
  }

  const username = String(request.nextUrl.searchParams.get("username") || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase()

  if (username && !/^[a-z0-9._]{1,30}$/.test(username)) {
    return redirectToMetaApp(request, "invalid_username", popupMode)
  }

  const redirectUri = getInstagramRedirectUri(request)
  const state = sealPayload({
    userId: session.user.id,
    appConfigId: app.id,
    expectedUsername: username || null,
    redirectUri,
    popup: popupMode,
    nonce: randomBytes(18).toString("hex"),
    expiresAt: Date.now() + 10 * 60 * 1000,
  })

  const authorizeUrl = new URL("https://www.instagram.com/oauth/authorize")
  authorizeUrl.searchParams.set("client_id", app.metaAppId)
  authorizeUrl.searchParams.set("redirect_uri", redirectUri)
  authorizeUrl.searchParams.set("response_type", "code")
  authorizeUrl.searchParams.set("scope", INSTAGRAM_SCOPES.join(","))
  authorizeUrl.searchParams.set("state", state)

  return NextResponse.redirect(authorizeUrl)
}
