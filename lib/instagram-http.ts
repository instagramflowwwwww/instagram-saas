const DEFAULT_META_TIMEOUT_MS = 20_000

function getMetaTimeoutMs() {
  const configured = Number(process.env.INSTAGRAM_META_TIMEOUT_MS)
  if (Number.isFinite(configured) && configured >= 5_000 && configured <= 120_000) {
    return configured
  }
  return DEFAULT_META_TIMEOUT_MS
}

/**
 * Transporte direto para a API oficial do Instagram/Meta.
 * Não usa proxy, rotação de IP ou agente HTTP intermediário.
 */
export async function fetchInstagramRequest(
  input: string | URL,
  init: RequestInit = {}
) {
  const signal = init.signal || AbortSignal.timeout(getMetaTimeoutMs())
  return fetch(input, {
    ...init,
    cache: "no-store",
    signal,
  })
}
