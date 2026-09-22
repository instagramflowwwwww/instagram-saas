import { NextRequest, NextResponse } from "next/server"
import { getServerSession, type Session } from "next-auth"
import { authOptions } from "@/lib/auth"
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
  // Presente só quando a conexão foi iniciada pela API pública
  // (/api/v1/connections) em vez do dashboard. Quem autoriza no Instagram
  // nesse caso não necessariamente tem login no InstaFlow, então esse
  // fluxo não exige sessão — o state cifrado já garante autenticidade.
  connectionRequestId?: string
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

function decodeStateSafely(stateValue: string | null): Partial<OAuthState> | null {
  if (!stateValue) return null
  try {
    return openPayload<OAuthState>(stateValue)
  } catch {
    return null
  }
}

function apiFlowResponse(status: "connected" | "failed", message: string) {
  const title = status === "connected" ? "Conta conectada" : "Não foi possível conectar"
  const color = status === "connected" ? "#22c55e" : "#ef4444"
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" /><title>${title} · InstaFlow</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body{background:#0a0a0a;color:#e5e5e5;font-family:system-ui,-apple-system,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}
  .card{max-width:420px}
  h1{font-size:1.25rem;color:${color};margin-bottom:.5rem}
  p{color:#a3a3a3;font-size:.9rem;line-height:1.5}
</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p><p style="margin-top:1.5rem;color:#525252">Você já pode fechar esta aba.</p></div></body></html>`

  return new NextResponse(html, {
    status: status === "connected" ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}

async function markConnectionRequestFailed(
  connectionRequestId: string | undefined,
  errorCode: string,
  errorMessage: string
) {
  if (!connectionRequestId) return
  try {
    await prisma.apiConnectionRequest.update({
      where: { id: connectionRequestId },
      data: { status: "failed", errorCode, errorMessage },
    })
  } catch {
    // best-effort: não deixa a checagem de status quebrar o fluxo principal
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
  const error = request.nextUrl.searchParams.get("error")
  const errorReason = request.nextUrl.searchParams.get("error_reason")
  const code = request.nextUrl.searchParams.get("code")
  const stateValue = request.nextUrl.searchParams.get("state")
  const decodedState = decodeStateSafely(stateValue)
  const popupModeFromState = Boolean(decodedState?.popup)
  const connectionRequestIdFromState = decodedState?.connectionRequestId

  if (error || errorReason) {
    await markConnectionRequestFailed(
      connectionRequestIdFromState,
      "oauth_cancelled",
      "A autorização foi cancelada no Instagram."
    )
    if (connectionRequestIdFromState) {
      return apiFlowResponse("failed", "A autorização foi cancelada no Instagram.")
    }
    return redirectWithError(request, "oauth_cancelled", popupModeFromState)
  }

  if (!code || !stateValue) {
    await markConnectionRequestFailed(
      connectionRequestIdFromState,
      "missing_oauth_data",
      "A Meta não retornou os dados necessários para concluir a conexão."
    )
    if (connectionRequestIdFromState) {
      return apiFlowResponse(
        "failed",
        "A Meta não retornou os dados necessários para concluir a conexão."
      )
    }
    return redirectWithError(request, "missing_oauth_data", popupModeFromState)
  }

  let state: OAuthState

  try {
    state = openPayload<OAuthState>(stateValue)
  } catch {
    return redirectWithError(request, "invalid_state", popupModeFromState)
  }

  const isApiFlow = Boolean(state.connectionRequestId)
  const popupMode = Boolean(state.popup)

  // O fluxo iniciado pelo dashboard exige que quem autoriza no Instagram
  // esteja logado no InstaFlow como o mesmo usuário que começou a conexão.
  // O fluxo da API pública não tem essa exigência — o state cifrado (com
  // expiração curta) já garante que só quem gerou o link pode completá-lo.
  let session: Session | null = null
  if (!isApiFlow) {
    session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL("/login", request.url))
    }
  }

  if (
    (!isApiFlow && state.userId !== session?.user?.id) ||
    !state.appConfigId ||
    !state.expiresAt ||
    Date.now() > state.expiresAt
  ) {
    await markConnectionRequestFailed(
      state.connectionRequestId,
      "expired",
      "A tentativa de conexão expirou."
    )
    if (isApiFlow) {
      return apiFlowResponse("failed", "A tentativa de conexão expirou. Peça um novo link.")
    }
    return redirectWithError(request, "expired_state", popupMode)
  }

  const app = await prisma.instagramApp.findFirst({
    where: {
      id: state.appConfigId,
      userId: state.userId,
    },
  })

  if (!app) {
    await markConnectionRequestFailed(
      state.connectionRequestId,
      "app_not_configured",
      "App Meta não encontrado."
    )
    if (isApiFlow) {
      return apiFlowResponse("failed", "App Meta não encontrado.")
    }
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
      await markConnectionRequestFailed(
        state.connectionRequestId,
        "wrong_account",
        `Foi autorizada a conta @${username}, mas o esperado era @${state.expectedUsername}.`
      )
      if (isApiFlow) {
        return apiFlowResponse(
          "failed",
          `Você autorizou @${username}, mas o esperado era @${state.expectedUsername}.`
        )
      }
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
      instagramUsername: null,
      instagramPassword: null,
      sessionFilePath: null,
      lastActiveAt: new Date(),
      profileSyncedAt: new Date(),
    }

    await prisma.$transaction(async (tx) => {
      const existingAccount = await tx.instagramAccount.findFirst({
        where: {
          userId: state.userId,
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
              userId: state.userId,
              igUserId,
              ...accountData,
            },
            select: { id: true },
          })

      await tx.instagramApp.update({
        where: { id: app.id },
        data: { lastValidatedAt: new Date() },
      })

      if (state.connectionRequestId) {
        try {
          await tx.apiConnectionRequest.update({
            where: { id: state.connectionRequestId },
            data: {
              status: "connected",
              instagramAccountId: account.id,
              connectedUsername: username,
            },
          })
        } catch {
          // best-effort: não deixa a checagem de status quebrar a conexão
        }
      }

      return account
    })

    if (isApiFlow) {
      return apiFlowResponse("connected", `Conta @${username} conectada com sucesso.`)
    }

    const url = getDashboardUrl(request, popupMode)
    url.searchParams.set("success", "connected")
    url.searchParams.set("username", username)
    url.searchParams.set("appConfigId", app.id)
    return NextResponse.redirect(url)
  } catch (error) {
    console.error("Instagram official callback error", error)
    await markConnectionRequestFailed(
      state.connectionRequestId,
      "callback_failed",
      getCallbackErrorMessage(error)
    )
    if (isApiFlow) {
      return apiFlowResponse("failed", getCallbackErrorMessage(error))
    }
    const url = getDashboardUrl(request, popupMode)
    url.searchParams.set("error", "callback_failed")
    url.searchParams.set("message", getCallbackErrorMessage(error))
    url.searchParams.set("appConfigId", app.id)
    return NextResponse.redirect(url)
  }
}
