import http from "http"
import https from "https"
import { HttpsProxyAgent } from "https-proxy-agent"
import {
  getOrAssignProxyForAccount,
  isInstagramProxyRequired,
  proxyValueToUrl,
} from "@/lib/proxy-manager"

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

    const finishError = (error: Error) => {
      if (settled) return
      settled = true
      agent.destroy()
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
          agent.destroy()
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

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("A proxy excedeu o tempo limite da requisição."))
    })

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

export async function fetchInstagramRequest(
  input: string | URL,
  init: RequestInit = {},
  accountId?: string
) {
  if (!accountId) {
    return fetch(input, { ...init, cache: "no-store" })
  }

  const proxy = await getOrAssignProxyForAccount(accountId)

  if (!proxy) {
    if (isInstagramProxyRequired()) {
      throw new Error(
        "Não há proxy disponível para esta conta. Importe novas proxies no painel administrativo."
      )
    }

    return fetch(input, { ...init, cache: "no-store" })
  }

  return requestThroughProxy(input, init, proxy)
}
