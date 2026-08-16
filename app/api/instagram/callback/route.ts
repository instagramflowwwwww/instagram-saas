import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import {
  isInstagramDisconnectError,
  markInstagramAccountDisconnected,
} from "@/lib/instagram-account-lifecycle"
import {
  fetchInstagramProfile,
  getInstagramRedirectUri,
  getMetaError,
  metaErrorMessage,
  parseMetaCount,
  readJsonResponse,
} from "@/lib/instagram-meta"
import { prisma } from "@/lib/prisma"
import {
  assignProxyToAccount,
  isInstagramProxyRequired,
} from "@/lib/proxy-manager"
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
  redirectUri?: string
  popup?: boolean
  nonce: string
  expiresAt: number
}

function getDashboardUrl(request: NextRequest, popupMode: boolean) {
  const url = new URL("/dashboard/meta-app", request.url)
  if (popupMode) {
    url.searchParams.set("oauthPopup", "1")
  }
  return url
}

function redirectWithError(
  request: NextRequest,
  error: string,
  popupMode = false
) {
  const url = getDashboardUrl(request, popupMode)
  url.searchParams.set("error", error)
  return NextResponse.redirect(url)
}

function getPopupModeFromState(stateValue: string | null) {
  if (!stateValue) return false

  try {
    return Boolean(openPayload<OAuthState>(stateValue).popup)
  } catch {
    return false
  }
}

function getCallbackErrorMessage(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Erro ao conectar a conta"

  if (
    /redirect_uri/i.test(message) ||
    /verification code/i.test(message)
  ) {
    return "A URL de retorno usada no início da conexão ficou diferente da URL usada na confirmação. Inicie a conexão novamente após o novo deploy."
  }

  return message
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
  const popupModeFromState = getPopupModeFromState(stateValue)

  if (error || errorReason) {
    return redirectWithError(request, "oauth_cancelled", popupModeFromState)
  }

  if (!code || !stateValue) {
    return redirectWithError(request, "missing_oauth_data", popupModeFromState)
  }

  let state: OAuthState

  try {
    state = openPayload<OAuthState>(stateValue)
  } catch {
    return redirectWithError(request, "invalid_state", popupModeFromState)
  }

  const popupMode = Boolean(state.popup)

  if (
    state.userId !== session.user.id ||
    !state.appConfigId ||
    !state.expiresAt ||
    Date.now() > state.expiresAt
  ) {
    return redirectWithError(request, "expired_state", popupMode)
  }

  const app = await prisma.instagramApp.findFirst({
    where: {
      id: state.appConfigId,
      userId: session.user.id,
    },
  })

  if (!app) {
    return redirectWithError(request, "app_not_configured", popupMode)
  }

  try {
    const appSecret = decryptValue(app.appSecretEncrypted)
    const redirectUri = state.redirectUri || getInstagramRedirectUri(request)

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

    const profile = await fetchInstagramProfile(accessToken)
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
      const url = getDashboardUrl(request, popupMode)
      url.searchParams.set("error", "wrong_account")
      url.searchParams.set("connected", username)
      url.searchParams.set("expected", state.expectedUsername)
      url.searchParams.set("appConfigId", app.id)
      return NextResponse.redirect(url)
    }

    const tokenExpiresAt = new Date(
      Date.now() + Math.max(3600, expiresIn) * 1000
    )

    const accountData = {
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
      followerCount: parseMetaCount(profile.followers_count),
      mediaCount: parseMetaCount(profile.media_count),
      connectionType: "official",
      isActive: true,
      proxy: null,
      instagramUsername: null,
      instagramPassword: null,
      sessionFilePath: null,
      lastActiveAt: new Date(),
    }

    const connectedAccount = await prisma.$transaction(async (tx) => {
      const existingAccount = await tx.instagramAccount.findFirst({
        where: {
          userId: session.user.id,
          igUserId,
        },
        select: { id: true },
      })

      const account = existingAccount
        ? await tx.instagramAccount.update({
            where: { id: existingAccount.id },
            data: accountData,
            select: { id: true },
          })
        : await tx.instagramAccount.create({
            data: {
              userId: session.user.id,
              igUserId,
              ...accountData,
            },
            select: { id: true },
          })

      await tx.instagramApp.update({
        where: { id: app.id },
        data: { lastValidatedAt: new Date() },
      })

      return account
    })

    const assignedProxy = await assignProxyToAccount(connectedAccount.id)

    if (!assignedProxy && isInstagramProxyRequired()) {
      console.warn("Instagram account connected without an available proxy", {
        accountId: connectedAccount.id,
        username,
      })
    }

    // A conta já foi autenticada e salva antes desta etapa. Falhas temporárias
    // de proxy não devem transformar uma conta válida em callback_failed.
    // Apenas erros que realmente exigem reconexão da conta (ex.: code 190)
    // invalidam a conexão.
    if (assignedProxy) {
      try {
        await fetchInstagramProfile(accessToken, connectedAccount.id)
      } catch (proxyValidationError) {
        if (isInstagramDisconnectError(proxyValidationError)) {
          await markInstagramAccountDisconnected(connectedAccount.id)
          throw proxyValidationError
        }

        console.warn(
          "Instagram proxy validation failed after account connection; keeping account connected",
          {
            accountId: connectedAccount.id,
            username,
            message:
              proxyValidationError instanceof Error
                ? proxyValidationError.message
                : String(proxyValidationError),
          }
        )
      }
    }

    const url = getDashboardUrl(request, popupMode)
    url.searchParams.set("success", "connected")
    url.searchParams.set("username", username)
    url.searchParams.set("appConfigId", app.id)
    return NextResponse.redirect(url)
  } catch (error) {
    console.error("Instagram official callback error", error)
    const url = getDashboardUrl(request, popupMode)
    url.searchParams.set("error", "callback_failed")
    url.searchParams.set("message", getCallbackErrorMessage(error))
    url.searchParams.set("appConfigId", app.id)
    return NextResponse.redirect(url)
  }
}
