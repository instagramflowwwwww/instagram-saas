import { NextRequest } from "next/server"
import { fetchInstagramRequest } from "@/lib/instagram-http"

export const INSTAGRAM_GRAPH_VERSION =
  process.env.INSTAGRAM_GRAPH_VERSION || "v25.0"

export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_insights",
]

export type MetaApiError = {
  message: string
  type?: string
  code?: number
  error_subcode?: number
  fbtrace_id?: string
}

export type InstagramProfile = {
  id?: string
  user_id?: string
  username?: string
  name?: string
  account_type?: string
  profile_picture_url?: string
  followers_count?: number | string
  follows_count?: number | string
  media_count?: number | string
}

const INSTAGRAM_PROFILE_FIELDS = [
  "user_id",
  "username",
  "name",
  "account_type",
  "profile_picture_url",
  "followers_count",
  "follows_count",
  "media_count",
].join(",")

export function getPublicBaseUrl(request?: NextRequest | Request) {
  const configured = process.env.NEXT_PUBLIC_URL?.trim().replace(/\/$/, "")
  if (configured) return configured

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (productionHost) return `https://${productionHost.replace(/\/$/, "")}`

  if (request) return new URL(request.url).origin

  return "http://localhost:3000"
}

export function getInstagramRedirectUri(request?: NextRequest | Request) {
  const configured = process.env.INSTAGRAM_REDIRECT_URI?.trim()
  if (configured) return configured.replace(/\/+$/, "")

  return `${getPublicBaseUrl(request)}/api/instagram/callback`
}

export function getMetaError(payload: unknown): MetaApiError | null {
  if (!payload || typeof payload !== "object") return null

  const record = payload as Record<string, unknown>
  const rawError = record.error

  if (rawError && typeof rawError === "object") {
    const error = rawError as Record<string, unknown>
    return {
      message: String(error.message || "Erro retornado pela Meta"),
      type: error.type ? String(error.type) : undefined,
      code: typeof error.code === "number" ? error.code : undefined,
      error_subcode:
        typeof error.error_subcode === "number"
          ? error.error_subcode
          : undefined,
      fbtrace_id: error.fbtrace_id ? String(error.fbtrace_id) : undefined,
    }
  }

  if (record.error_message) {
    return {
      message: String(record.error_message),
      type: record.error_type ? String(record.error_type) : undefined,
      code:
        typeof record.code === "number"
          ? record.code
          : typeof record.error_code === "number"
            ? record.error_code
            : undefined,
    }
  }

  return null
}

export function metaErrorMessage(error: MetaApiError | null) {
  if (!error) return "A Meta retornou uma resposta vazia ou inválida para a solicitação."

  const normalizedMessage = error.message.toLowerCase()

  if (error.code === 190) {
    return "O Instagram bloqueou temporariamente o acesso desta conta. Entre no Instagram, conclua a verificação solicitada e depois reconecte a conta no App Meta."
  }

  if (normalizedMessage.includes("api access deactivated")) {
    return "A Meta desativou o acesso da API para esta conta. Reconecte a conta pelo App Meta antes de tentar publicar novamente."
  }

  if (normalizedMessage.includes("unsupported request - method type: post")) {
    return "Esta conta não aceita publicação pela API no estado atual. Reconecte a conta pelo App Meta."
  }

  if (error.code === 25 && error.error_subcode === 2207050) {
    return "A conta do Instagram está restrita pela Meta e não pode publicar pela API neste momento."
  }

  if (error.code === 9 && error.error_subcode === 2207042) {
    return "Limite de publicação da Meta atingido para esta conta. A nova tentativa será feita após a janela de cota liberar."
  }

  if (error.code === 10 || error.code === 200) {
    return "O App Meta não possui a permissão necessária para esta ação."
  }

  if (error.code === 4 || error.code === 17 || error.code === 32) {
    return "O limite temporário da API da Meta foi atingido. Tente novamente mais tarde."
  }

  return error.message
}

export async function readJsonResponse(response: Response) {
  const raw = await response.text()

  if (!raw.trim()) return { payload: null, raw }

  try {
    return { payload: JSON.parse(raw) as Record<string, any>, raw }
  } catch {
    return { payload: null, raw }
  }
}

export function parseMetaCount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }

  return null
}

export async function fetchInstagramProfile(accessToken: string) {
  const url = new URL(
    `https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}/me`
  )
  url.searchParams.set("fields", INSTAGRAM_PROFILE_FIELDS)
  url.searchParams.set("access_token", accessToken)

  const response = await fetchInstagramRequest(url)
  const { payload, raw } = await readJsonResponse(response)

  if (!response.ok || !payload) {
    const error = getMetaError(payload)

    console.error("Instagram profile request failed", {
      status: response.status,
      body: raw.slice(0, 1000),
    })

    const requestError = new Error(metaErrorMessage(error)) as Error & {
      metaCode?: number
      metaSubcode?: number
      httpStatus?: number
    }
    requestError.metaCode = error?.code
    requestError.metaSubcode = error?.error_subcode
    requestError.httpStatus = response.status
    throw requestError
  }

  return payload as InstagramProfile
}
