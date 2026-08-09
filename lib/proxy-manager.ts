import { createHash } from "crypto"
import { prisma } from "@/lib/prisma"
import { decryptValue, encryptValue } from "@/lib/secure-store"

const MAX_IMPORT_SIZE = 10_000
const IMPORT_CHUNK_SIZE = 500
const ASSIGN_RETRIES = 3

export type ProxyPoolStats = {
  total: number
  available: number
  assigned: number
  consumed: number
  inactive: number
}

type ParsedProxy = {
  normalized: string
  url: string
}

function normalizeProxy(value: string): ParsedProxy {
  const trimmed = String(value || "").trim()
  const match = /^([^:\s]+):(\d+):([^:]+):(.+)$/.exec(trimmed)

  if (!match) {
    throw new Error(
      "Proxy inválida. Use o formato host:porta:usuario:senha."
    )
  }

  const [, host, portValue, username, password] = match
  const port = Number(portValue)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Porta inválida na proxy ${host}:${portValue}.`)
  }

  if (!username.trim() || !password) {
    throw new Error(`Usuário ou senha ausente na proxy ${host}:${portValue}.`)
  }

  const normalized = `${host}:${port}:${username.trim()}:${password}`
  const url = `http://${encodeURIComponent(username.trim())}:${encodeURIComponent(password)}@${host}:${port}`

  return { normalized, url }
}

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function proxyFingerprint(value: string) {
  return fingerprint(normalizeProxy(value).normalized)
}

function isPrismaUniqueError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  )
}

export function isInstagramProxyRequired() {
  return ["1", "true", "yes", "on"].includes(
    String(process.env.INSTAGRAM_PROXY_REQUIRED || "")
      .trim()
      .toLowerCase()
  )
}

export function proxyValueToUrl(value: string) {
  return normalizeProxy(value).url
}

export async function importInstagramProxies(values: unknown) {
  if (!Array.isArray(values)) {
    throw new Error('Envie um JSON no formato { "proxies": ["host:porta:usuario:senha"] }.')
  }

  if (values.length === 0) {
    throw new Error("A lista de proxies está vazia.")
  }

  if (values.length > MAX_IMPORT_SIZE) {
    throw new Error(`O limite por importação é ${MAX_IMPORT_SIZE} proxies.`)
  }

  const unique = new Map<string, { fingerprint: string; encryptedValue: string }>()

  for (const rawValue of values) {
    if (typeof rawValue !== "string") {
      throw new Error("Todas as proxies precisam ser strings.")
    }

    const parsed = normalizeProxy(rawValue)
    const hash = fingerprint(parsed.normalized)

    if (!unique.has(hash)) {
      unique.set(hash, {
        fingerprint: hash,
        encryptedValue: encryptValue(parsed.normalized),
      })
    }
  }

  const rows = Array.from(unique.values())
  let inserted = 0

  for (let index = 0; index < rows.length; index += IMPORT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + IMPORT_CHUNK_SIZE)
    const result = await prisma.instagramProxy.createMany({
      data: chunk,
      skipDuplicates: true,
    })
    inserted += result.count
  }

  return {
    received: values.length,
    validUnique: rows.length,
    inserted,
    duplicates: rows.length - inserted,
  }
}

export async function clearInstagramProxyPool() {
  return prisma.$transaction(async (tx) => {
    const deleted = await tx.instagramProxy.deleteMany({})

    await tx.instagramAccount.updateMany({
      data: {
        proxy: null,
        proxyAssignedAt: null,
      },
    })

    return { deleted: deleted.count }
  })
}

export async function getProxyPoolStats(): Promise<ProxyPoolStats> {
  const [total, available, assigned, consumed, inactive] = await Promise.all([
    prisma.instagramProxy.count(),
    prisma.instagramProxy.count({
      where: { isActive: true, usedAt: null },
    }),
    prisma.instagramProxy.count({
      where: { assignedAccountId: { not: null } },
    }),
    prisma.instagramProxy.count({
      where: { usedAt: { not: null } },
    }),
    prisma.instagramProxy.count({
      where: { isActive: false },
    }),
  ])

  return { total, available, assigned, consumed, inactive }
}

export async function getProxyForAccount(accountId: string) {
  const assigned = await prisma.instagramProxy.findUnique({
    where: { assignedAccountId: accountId },
    select: { encryptedValue: true, isActive: true },
  })

  if (!assigned?.isActive) return null
  return decryptValue(assigned.encryptedValue)
}

/**
 * Coloca em quarentena somente a proxy que realmente falhou.
 * O fingerprint evita que uma requisição concorrente desative uma proxy nova
 * que já tenha sido atribuída à mesma conta.
 */
export async function quarantineFailedProxyForAccount(
  accountId: string,
  failedProxyValue: string
) {
  const failedFingerprint = proxyFingerprint(failedProxyValue)

  return prisma.$transaction(async (tx) => {
    const assigned = await tx.instagramProxy.findUnique({
      where: { assignedAccountId: accountId },
      select: { id: true, fingerprint: true },
    })

    if (!assigned || assigned.fingerprint !== failedFingerprint) {
      return false
    }

    await tx.instagramProxy.update({
      where: { id: assigned.id },
      data: {
        isActive: false,
        assignedAccountId: null,
      },
    })

    await tx.instagramAccount.updateMany({
      where: { id: accountId },
      data: { proxyAssignedAt: null },
    })

    return true
  })
}

async function assignInTransaction(accountId: string) {
  return prisma.$transaction(async (tx) => {
    const account = await tx.instagramAccount.findUnique({
      where: { id: accountId },
      select: { id: true },
    })

    if (!account) {
      throw new Error("Conta do Instagram não encontrada.")
    }

    const existing = await tx.instagramProxy.findUnique({
      where: { assignedAccountId: accountId },
      select: { encryptedValue: true, isActive: true },
    })

    if (existing?.isActive) {
      return existing.encryptedValue
    }

    const available = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "InstagramProxy"
      WHERE "isActive" = true
        AND "usedAt" IS NULL
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `

    const selected = available[0]
    if (!selected) return null

    const now = new Date()
    const updated = await tx.instagramProxy.update({
      where: { id: selected.id },
      data: {
        usedAt: now,
        assignedAt: now,
        assignedAccountId: accountId,
      },
      select: { encryptedValue: true },
    })

    await tx.instagramAccount.update({
      where: { id: accountId },
      data: { proxyAssignedAt: now },
    })

    return updated.encryptedValue
  })
}

export async function assignProxyToAccount(accountId: string) {
  const current = await getProxyForAccount(accountId)
  if (current) return current

  for (let attempt = 0; attempt < ASSIGN_RETRIES; attempt += 1) {
    try {
      const encryptedValue = await assignInTransaction(accountId)
      return encryptedValue ? decryptValue(encryptedValue) : null
    } catch (error) {
      if (!isPrismaUniqueError(error) || attempt === ASSIGN_RETRIES - 1) {
        throw error
      }

      const assigned = await getProxyForAccount(accountId)
      if (assigned) return assigned
    }
  }

  return null
}

export async function getOrAssignProxyForAccount(accountId: string) {
  return (await getProxyForAccount(accountId)) || assignProxyToAccount(accountId)
}
