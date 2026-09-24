import { decryptValue } from "@/lib/secure-store"
import { prisma } from "@/lib/prisma"

// Cliente da API do Storrito (https://storrito.com/documentation/api/v1/).
// Todas as chamadas são POST com corpo JSON e "Authorization: Bearer".

// A URL base é digitada pelo usuário e o servidor faz requisições para ela,
// então só aceitamos o formato oficial (https://<uuid>.storrito.com/api/v1)
// pra ninguém usar isso pra fazer o servidor acessar endereços internos.
const BASE_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.storrito\.com\/api\/v1$/i

export function normalizeStorritoBaseUrl(value: string) {
  const cleaned = value.trim().replace(/\/+$/, "")
  return BASE_URL_PATTERN.test(cleaned) ? cleaned : null
}

const CONNECT_LINK_PATTERN =
  /^https:\/\/[a-z0-9-]+\.storrito\.com\/ui\/[a-z0-9-]+\?connect-link=[a-z0-9-]+$/i

export function normalizeStorritoConnectLink(value: string) {
  const cleaned = value.trim()
  return CONNECT_LINK_PATTERN.test(cleaned) ? cleaned : null
}

export class StorritoError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function rpc<T>(
  connection: { baseUrl: string; token: string },
  procedure: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const maxAttempts = 4

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(`${connection.baseUrl}/${procedure}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    })

    // 429 e erros de balanceador (deploy do Storrito): tenta de novo com espera.
    if ([429, 502, 503, 504].includes(response.status) && attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 1000))
      continue
    }

    const raw = await response.text()
    let payload: unknown = null
    try {
      payload = raw ? JSON.parse(raw) : null
    } catch {
      payload = null
    }

    if (!response.ok) {
      const detail =
        payload && typeof payload === "object" && "validationErrorExplanation" in payload
          ? String((payload as Record<string, unknown>).validationErrorExplanation)
          : ""
      const message =
        response.status === 401 || response.status === 403
          ? "O Storrito recusou o token. Confira a URL base e o token salvos."
          : response.status === 429
            ? "O Storrito limitou as requisições. Tente de novo em alguns segundos."
            : `O Storrito respondeu com erro ${response.status}.${detail ? ` ${detail}` : ""}`
      throw new StorritoError(message, response.status)
    }

    if (payload === null || typeof payload !== "object") {
      const preview = raw.replace(/\s+/g, " ").slice(0, 120)
      throw new StorritoError(
        `O Storrito respondeu, mas não no formato esperado. Confira se a URL base está certa (copie a que aparece na tela de credenciais da API). Resposta recebida: "${preview || "vazia"}"`,
        502
      )
    }

    return payload as T
  }

  throw new StorritoError("O Storrito não respondeu. Tente novamente.", 504)
}

export async function getStorritoConnection(userId: string) {
  const record = await prisma.storritoConnection.findUnique({ where: { userId } })
  if (!record) return null
  return { baseUrl: record.baseUrl, token: decryptValue(record.tokenEncrypted) }
}

export function listInstagramUsers(connection: { baseUrl: string; token: string }) {
  return rpc<{ instagramUsers: { instagramId: string; instagramUsername: string }[] }>(
    connection,
    "list-instagram-users"
  )
}

export function scheduleStory(
  connection: { baseUrl: string; token: string },
  params: {
    html: string
    instagramUsername: string
    storyPostUuid: string
    date?: string
  }
) {
  return rpc<{ storyPostUuid: string; status: string; warnings?: unknown[] }>(
    connection,
    "schedule-instagram-story",
    params
  )
}

export function getStoryStatus(
  connection: { baseUrl: string; token: string },
  storyPostUuid: string
) {
  return rpc<{ storyPostUuid: string; status: string }>(connection, "status-instagram-story", {
    storyPostUuid,
  })
}

export function cancelStory(
  connection: { baseUrl: string; token: string },
  storyPostUuid: string
) {
  return rpc<{ storyPostUuid: string; status: string }>(connection, "cancel-instagram-story", {
    storyPostUuid,
  })
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

export const LINK_DESIGNS = ["default", "gray", "black", "rainbow"] as const
export type LinkDesign = (typeof LINK_DESIGNS)[number]

// Monta o HTML do story: mídia de fundo em tela cheia (1080x1920) e o adesivo
// de link mais pro pé da tela, acima da área coberta pela barra de resposta
// do Instagram.
export function buildStoryHtml(params: {
  mediaUrl: string
  mediaType: "image" | "video"
  linkUrl: string
  linkText: string
  design: LinkDesign
}) {
  const src = escapeAttribute(params.mediaUrl)
  const fill =
    "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover"
  const background =
    params.mediaType === "video"
      ? `<video src="${src}" style="${fill}" muted playsinline></video>`
      : `<img src="${src}" style="${fill}" />`

  return (
    `<insta-story>${background}` +
    `<div style="position:absolute;top:0;left:0;width:100%;height:100%;box-sizing:border-box;` +
    `padding:0 40px 420px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end">` +
    `<insta-link url="${escapeAttribute(params.linkUrl)}" text="${escapeAttribute(params.linkText)}" ` +
    `design="${params.design}"></insta-link>` +
    `</div></insta-story>`
  )
}
