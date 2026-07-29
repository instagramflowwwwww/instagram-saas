import { NextRequest } from "next/server"

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

export function getPublicBaseUrl(request?: NextRequest | Request) {
  const configured = process.env.NEXT_PUBLIC_URL?.trim().replace(/\/$/, "")
  if (configured) return configured

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (productionHost) return `https://${productionHost.replace(/\/$/, "")}`

  if (request) return new URL(request.url).origin

  return "http://localhost:3000"
}

export function getInstagramRedirectUri(request?: NextRequest | Request) {
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
  if (!error) return "A Meta não concluiu a solicitação"

  if (error.code === 190) {
    return "O acesso desta conta expirou. Reconecte a conta pelo App Meta."
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
