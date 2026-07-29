import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import {
  getInstagramRedirectUri,
  getMetaError,
  INSTAGRAM_GRAPH_VERSION,
  metaErrorMessage,
  readJsonResponse,
} from "@/lib/instagram-meta"
import { prisma } from "@/lib/prisma"
import {
  decryptValue,
  encryptValue,
  openPayload,
} from "@/lib/secure-store"

export const runtime = "nodejs"
export const maxDuration = 60

type OAuthState = {
  userId: string
  appConfigId: string
  expectedUsername: string | null
  nonce: string
  expiresAt: number
}

type InstagramProfile = {
  id?: string
  user_id?: string
  username?: string
  name?: string
  account_type?: string
  profile_picture_url?: string
  followers_count?: number
  media_count?: number
}

function redirectWithError(request: NextRequest, error: string) {
  const url = new URL("/dashboard/meta-app", request.url)
  url.searchParams.set("error", error)
  return NextResponse.redirect(url)
}

async function fetchProfile(accessToken: string) {
  const fieldSets = [
    "id,user_id,username,name,account_type,profile_picture_url,followers_count,media_count",
    "id,user_id,username,name,account_type,profile_picture_url",
    "id,username,account_type",
  ]

  let lastError = "Não foi possível carregar o perfil do Instagram"

  for (const fields of fieldSets) {
    const url = new URL(
      `https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}/me`
    )
    url.searchParams.set("fields", fields)
    url.searchParams.set("access_token", accessToken)

    const response = await fetch(url, { cache: "no-store" })
    const { payload } = await readJsonResponse(response)

    if (response.ok && payload) {
      return payload as InstagramProfile
    }

    lastError = metaErrorMessage(getMetaError(payload))
  }

  throw new Error(lastError)
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const error = request.nextUrl.searchParams.get("error")
  const errorReason = request.nextUrl.searchParams.get("error_reason")
  const code = request.nextUrl.searchParams.get("code")
  const stateValue = request.nextUrl.searchParams.get("state")

  if (error || errorReason) {
    return redirectWithError(request, "oauth_cancelled")
  }

  if (!code || !stateValue) {
    return redirectWithError(request, "missing_oauth_data")
  }

  let state: OAuthState

  try {
    state = openPayload<OAuthState>(stateValue)
  } catch {
    return redirectWithError(request, "invalid_state")
  }

  if (
    state.userId !== session.user.id ||
    !state.appConfigId ||
    !state.expiresAt ||
    Date.now() > state.expiresAt
  ) {
    return redirectWithError(request, "expired_state")
  }

  const app = await prisma.instagramApp.findFirst({
    where: {
      id: state.appConfigId,
      userId: session.user.id,
    },
  })

  if (!app) {
    return redirectWithError(request, "app_not_configured")
  }

  try {
    const appSecret = decryptValue(app.appSecretEncrypted)
    const redirectUri = getInstagramRedirectUri(request)

    const tokenResponse = await fetch(
      "https://api.instagram.com/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: app.metaAppId,
          client_secret: appSecret,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code,
        }),
        cache: "no-store",
      }
    )

    const { payload: tokenData, raw: tokenRaw } =
      await readJsonResponse(tokenResponse)

    if (!tokenResponse.ok || !tokenData?.access_token) {
      console.error("Instagram token exchange failed", {
        status: tokenResponse.status,
        body: tokenRaw.slice(0, 1000),
      })
      throw new Error(metaErrorMessage(getMetaError(tokenData)))
    }

    let accessToken = String(tokenData.access_token)
    let expiresIn = 3600

    const longTokenUrl = new URL(
      "https://graph.instagram.com/access_token"
    )
    longTokenUrl.searchParams.set("grant_type", "ig_exchange_token")
    longTokenUrl.searchParams.set("client_secret", appSecret)
    longTokenUrl.searchParams.set("access_token", accessToken)

    const longTokenResponse = await fetch(longTokenUrl, {
      cache: "no-store",
    })
    const { payload: longTokenData, raw: longTokenRaw } =
      await readJsonResponse(longTokenResponse)

    if (longTokenResponse.ok && longTokenData?.access_token) {
      accessToken = String(longTokenData.access_token)
      expiresIn = Number(longTokenData.expires_in || 60 * 24 * 60 * 60)
    } else {
      console.warn("Instagram long-lived token exchange failed", {
        status: longTokenResponse.status,
        body: longTokenRaw.slice(0, 1000),
      })
    }

    const profile = await fetchProfile(accessToken)
    const igUserId = String(
      profile.id || tokenData.user_id || profile.user_id || ""
    )
    const username = String(profile.username || "").toLowerCase()

    if (!igUserId || !username) {
      throw new Error("A Meta não retornou o ID e o usuário da conta.")
    }

    if (
      state.expectedUsername &&
      state.expectedUsername.toLowerCase() !== username
    ) {
      const url = new URL("/dashboard/meta-app", request.url)
      url.searchParams.set("error", "wrong_account")
      url.searchParams.set("connected", username)
      url.searchParams.set("expected", state.expectedUsername)
      return NextResponse.redirect(url)
    }

    const tokenExpiresAt = new Date(
      Date.now() + Math.max(3600, expiresIn) * 1000
    )

    await prisma.$transaction([
      prisma.instagramAccount.upsert({
        where: {
          userId_igUserId: {
            userId: session.user.id,
            igUserId,
          },
        },
        update: {
          appConfigId: app.id,
          username,
          name: profile.name ? String(profile.name) : null,
          accountType: profile.account_type
            ? String(profile.account_type)
            : null,
          profilePicture: profile.profile_picture_url
            ? String(profile.profile_picture_url)
            : null,
          accessToken: encryptValue(accessToken),
          tokenExpiresAt,
          followerCount:
            typeof profile.followers_count === "number"
              ? profile.followers_count
              : null,
          mediaCount:
            typeof profile.media_count === "number"
              ? profile.media_count
              : null,
          connectionType: "official",
          isActive: true,
          proxy: null,
          instagramUsername: null,
          instagramPassword: null,
          sessionFilePath: null,
          lastActiveAt: new Date(),
        },
        create: {
          userId: session.user.id,
          appConfigId: app.id,
          igUserId,
          username,
          name: profile.name ? String(profile.name) : null,
          accountType: profile.account_type
            ? String(profile.account_type)
            : null,
          profilePicture: profile.profile_picture_url
            ? String(profile.profile_picture_url)
            : null,
          accessToken: encryptValue(accessToken),
          tokenExpiresAt,
          followerCount:
            typeof profile.followers_count === "number"
              ? profile.followers_count
              : null,
          mediaCount:
            typeof profile.media_count === "number"
              ? profile.media_count
              : null,
          connectionType: "official",
          isActive: true,
        },
      }),
      prisma.instagramApp.update({
        where: { id: app.id },
        data: { lastValidatedAt: new Date() },
      }),
    ])

    const url = new URL("/dashboard/meta-app", request.url)
    url.searchParams.set("success", "connected")
    url.searchParams.set("username", username)
    return NextResponse.redirect(url)
  } catch (error) {
    console.error("Instagram official callback error", error)
    const url = new URL("/dashboard/meta-app", request.url)
    url.searchParams.set("error", "callback_failed")
    url.searchParams.set(
      "message",
      error instanceof Error ? error.message : "Erro ao conectar a conta"
    )
    return NextResponse.redirect(url)
  }
}
