import { HttpsProxyAgent } from "https-proxy-agent"

const SUPPORTED_SCHEMES = [
  "http://",
  "https://",
  "socks4://",
  "socks5://",
  "socks5h://",
]

function validatePort(port: string) {
  if (!/^\d+$/.test(port)) {
    throw new Error("A porta do proxy precisa ser numérica")
  }

  const value = Number(port)
  if (value < 1 || value > 65535) {
    throw new Error("A porta do proxy é inválida")
  }

  return value
}

export function parseProxyUrl(proxy: string): string {
  const value = proxy.trim()

  if (!value) {
    throw new Error("Informe uma proxy válida")
  }

  if (SUPPORTED_SCHEMES.some((scheme) => value.startsWith(scheme))) {
    const parsed = new URL(value)

    if (!parsed.hostname || !parsed.port) {
      throw new Error("Proxy inválida. Informe host e porta")
    }

    validatePort(parsed.port)
    return parsed.toString()
  }

  const parts = value.split(":", 4)

  if (parts.length === 4) {
    const [host, port, username, password] = parts.map((part) => part.trim())

    if (!host || !username || !password) {
      throw new Error("Proxy inválida. Use host:porta:usuario:senha")
    }

    const normalizedPort = validatePort(port)
    return `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${normalizedPort}`
  }

  if (parts.length === 2) {
    const [host, port] = parts.map((part) => part.trim())

    if (!host) {
      throw new Error("Proxy inválida. Use host:porta")
    }

    const normalizedPort = validatePort(port)
    return `http://${host}:${normalizedPort}`
  }

  throw new Error("Proxy inválida. Use host:porta:usuario:senha")
}

export function getProxyAgent(proxy?: string | null) {
  if (!proxy) return undefined

  try {
    return new HttpsProxyAgent(parseProxyUrl(proxy))
  } catch {
    return undefined
  }
}
