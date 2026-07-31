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

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const app = await prisma.instagramApp.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      metaAppId: true,
    },
  })

  if (!app) {
    return NextResponse.redirect(
      new URL("/dashboard/meta-app?error=app_not_configured", request.url)
    )
  }

  const username = String(request.nextUrl.searchParams.get("username") || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase()

  if (username && !/^[a-z0-9._]{1,30}$/.test(username)) {
    return NextResponse.redirect(
      new URL("/dashboard/meta-app?error=invalid_username", request.url)
    )
  }

  const redirectUri = getInstagramRedirectUri(request)
  const state = sealPayload({
    userId: session.user.id,
    appConfigId: app.id,
    expectedUsername: username || null,
    redirectUri,
    nonce: randomBytes(18).toString("hex"),
    expiresAt: Date.now() + 10 * 60 * 1000,
  })

  const authorizeUrl = new URL("https://www.instagram.com/oauth/authorize")
  authorizeUrl.searchParams.set("client_id", app.metaAppId)
  authorizeUrl.searchParams.set("redirect_uri", redirectUri)
  authorizeUrl.searchParams.set("response_type", "code")
  authorizeUrl.searchParams.set("scope", INSTAGRAM_SCOPES.join(","))
  authorizeUrl.searchParams.set("state", state)
  authorizeUrl.searchParams.set("force_reauth", "true")

  return NextResponse.redirect(authorizeUrl)
}
