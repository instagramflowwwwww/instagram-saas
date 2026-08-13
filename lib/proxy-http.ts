import http from "http"
import https from "https"
import { HttpsProxyAgent } from "https-proxy-agent"
import {
  getOrAssignProxyForAccount,
  isInstagramProxyRequired,
  proxyValueToUrl,
  quarantineFailedProxyForAccount,
} from "@/lib/proxy-manager"

const PROXY_CACHE_TTL_MS = 30 * 1000
const DEFAULT_PROXY_ROTATION_ATTEMPTS = 4
const PROXY_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTDOWN",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
])

const proxyCache = new Map<
  string,
  { promise: Promise<string | null>; expiresAt: number }
>()

export function clearInstagramProxyCache(accountId?: string) {
  if (accountId) {
    proxyCache.delete(accountId)
    return
  }

  proxyCache.clear()
}

async function getCachedProxyForAccount(accountId: string) {
  const cached = proxyCache.get(accountId)
  if (cached && cached.expiresAt > Date.now()) return cached.promise

  const promise = getOrAssignProxyForAccount(accountId).catch((error) => {
    proxyCache.delete(accountId)
    throw error
  })

  proxyCache.set(accountId, {
    promise,
    expiresAt: Date.now() + PROXY_CACHE_TTL_MS,
  })

  return promise
}

function bodyToBuffer(body: BodyInit | null | undefined, headers: Headers) {
  if (body === undefined || body === null) return null

  if (typeof body === "string") return Buffer.from(body)

  if (body instanceof URLSearchParams) {
    if (!headers.has("content-type")) {
      headers.set(
        "content-type",
        "application/x-www-form-urlencoded;charset=UTF-8"
      )
    }
    return Buffer.from(body.toString())
  }

  if (body instanceof ArrayBuffer) {
    return Buffer.from(body)
  }

  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength)
  }

  throw new Error("Tipo de corpo não suportado na requisição via proxy.")
}

function responseHeaders(headers: http.IncomingHttpHeaders) {
  const result = new Headers()

  Object.entries(headers).forEach(([name, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => result.append(name, item))
    } else if (value !== undefined) {
      result.set(name, value)
    }
  })

  return result
}

function proxyTimeoutError() {
  return Object.assign(
    new Error("A proxy excedeu o tempo limite da requisição."),
    { code: "ETIMEDOUT" }
  )
}

function isProxyTransportError(error: unknown) {
  if (!(error instanceof Error)) return false

  const code = String((error as NodeJS.ErrnoException).code || "").toUpperCase()
  if (PROXY_ERROR_CODES.has(code)) return true

  const message = error.message.toLowerCase()
  return [
    "proxy connection ended",
    "proxy response",
    "socket hang up",
    "tunneling socket",
    "connect timeout",
    "connection timeout",
  ].some((fragment) => message.includes(fragment))
}

function getProxyRotationAttempts() {
  const configured = Number(process.env.INSTAGRAM_PROXY_ROTATION_ATTEMPTS)
  if (Number.isInteger(configured) && configured > 0 && configured <= 10) {
    return configured
  }
  return DEFAULT_PROXY_ROTATION_ATTEMPTS
}

async function requestThroughProxy(
  input: string | URL,
  init: RequestInit,
  proxyValue: string
) {
  const url = input instanceof URL ? input : new URL(input)

  if (url.protocol !== "https:") {
    throw new Error("Somente URLs HTTPS são aceitas pelo transporte da Meta.")
  }

  const headers = new Headers(init.headers)
  const body = bodyToBuffer(init.body, headers)

  if (body && !headers.has("content-length")) {
    headers.set("content-length", String(body.byteLength))
  }

  const timeoutValue = Number(process.env.INSTAGRAM_PROXY_TIMEOUT_MS || 60_000)
  const timeoutMs = Number.isFinite(timeoutValue) && timeoutValue > 0
    ? timeoutValue
    : 60_000
  const agent = new HttpsProxyAgent(proxyValueToUrl(proxyValue))

  return new Promise<Response>((resolve, reject) => {
    let settled = false
    let overallTimer: NodeJS.Timeout | null = null

    const cleanup = () => {
      if (overallTimer) clearTimeout(overallTimer)
      overallTimer = null
      agent.destroy()
    }

    const finishError = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }

    const request = https.request(
      url,
      {
        method: init.method || "GET",
        headers: Object.fromEntries(headers.entries()),
        agent,
      },
      (incoming) => {
        const chunks: Buffer[] = []

        incoming.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })

        incoming.on("error", finishError)

        incoming.on("end", () => {
          if (settled) return
          settled = true
          cleanup()
          resolve(
            new Response(Buffer.concat(chunks), {
              status: incoming.statusCode || 500,
              statusText: incoming.statusMessage || "",
              headers: responseHeaders(incoming.headers),
            })
          )
        })
      }
    )

    // Timeout total: cobre inclusive DNS/conexão com o host da proxy, não só
    // o tempo de socket depois do CONNECT.
    overallTimer = setTimeout(() => {
      request.destroy(proxyTimeoutError())
    }, timeoutMs)

    request.on("error", finishError)

    const abort = () => {
      request.destroy(new Error("A requisição foi cancelada."))
    }

    if (init.signal) {
      if (init.signal.aborted) {
        abort()
        return
      }
      init.signal.addEventListener("abort", abort, { once: true })
    }

    if (body) request.write(body)
    request.end()
  })
}

async function retireFailedProxy(accountId: string, proxyValue: string) {
  try {
    await quarantineFailedProxyForAccount(accountId, proxyValue)
  } finally {
    clearInstagramProxyCache(accountId)
  }
}

export async function fetchInstagramRequest(
  input: string | URL,
  init: RequestInit = {},
  accountId?: string
) {
  if (!accountId) {
    return fetch(input, { ...init, cache: "no-store" })
  }

  const maxAttempts = getProxyRotationAttempts()
  let lastProxyError: unknown = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const proxy = await getCachedProxyForAccount(accountId)

    if (!proxy) {
      if (isInstagramProxyRequired()) {
        const suffix = lastProxyError
          ? " As proxies tentadas falharam e foram desativadas automaticamente."
          : ""
        throw new Error(
          `Não há proxy funcional disponível para esta conta.${suffix} Importe novas proxies no painel administrativo.`
        )
      }

      return fetch(input, { ...init, cache: "no-store" })
    }

    try {
      const response = await requestThroughProxy(input, init, proxy)

      // 407 vem do servidor de proxy, não da API da Meta.
      if (response.status === 407) {
        lastProxyError = new Error("A proxy recusou a autenticação (HTTP 407).")
        await retireFailedProxy(accountId, proxy)
        continue
      }

      // Nos logs de produção, proxies defeituosas também responderam 502 com
      // corpo vazio. Uma resposta da Meta com erro normalmente traz JSON; o
      // 502 vazio é tratado como gateway/proxy quebrado e rotacionado.
      if (response.status === 502) {
        const raw = await response.clone().text().catch(() => "")
        if (!raw.trim()) {
          lastProxyError = new Error("A proxy retornou HTTP 502 sem resposta da Meta.")
          console.warn("Instagram proxy returned empty 502; rotating account proxy", {
            accountId,
            attempt,
          })
          await retireFailedProxy(accountId, proxy)
          continue
        }
      }

      return response
    } catch (error) {
      if (!isProxyTransportError(error)) throw error

      lastProxyError = error
      console.warn("Instagram proxy failed; rotating account proxy", {
        accountId,
        attempt,
        code: (error as NodeJS.ErrnoException)?.code,
        message: error instanceof Error ? error.message : String(error),
      })
      await retireFailedProxy(accountId, proxy)
    }
  }

  const detail =
    lastProxyError instanceof Error ? ` Último erro: ${lastProxyError.message}` : ""
  throw new Error(
    `Nenhuma proxy funcional respondeu após ${maxAttempts} tentativa(s).${detail}`
  )
}
