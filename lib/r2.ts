import { createHash, createHmac, randomUUID } from "crypto"

export type R2HttpMethod = "PUT" | "HEAD" | "DELETE"

type R2Config = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
  endpointHost: string
  publicUrl: string
}

const REGION = "auto"
const SERVICE = "s3"
const STORAGE_PREFIX = "instagram-saas"

function getR2Config(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID?.trim()
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim()
  const bucketName = process.env.R2_BUCKET_NAME?.trim()
  const endpoint =
    process.env.R2_ENDPOINT?.trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "")
  const publicUrl = process.env.R2_PUBLIC_URL?.trim().replace(/\/+$/, "")

  let endpointHost = ""
  try {
    endpointHost = new URL(endpoint).hostname
  } catch {
    endpointHost = ""
  }

  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucketName ||
    !endpointHost ||
    !publicUrl
  ) {
    throw new Error("Cloudflare R2 não configurado no servidor")
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    endpointHost,
    publicUrl,
  }
}

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  )
}

function encodeObjectKey(key: string) {
  return key
    .split("/")
    .filter(Boolean)
    .map(encodeRfc3986)
    .join("/")
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest()
}

function getAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "")
}

function getSigningKey(secretAccessKey: string, dateStamp: string) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const regionKey = hmac(dateKey, REGION)
  const serviceKey = hmac(regionKey, SERVICE)
  return hmac(serviceKey, "aws4_request")
}

function normalizeHeaderValue(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

export function createR2PresignedUrl(params: {
  method: R2HttpMethod
  key: string
  contentType?: string
  expiresIn?: number
  now?: Date
}) {
  const config = getR2Config()
  const now = params.now || new Date()
  const expiresIn = Math.min(Math.max(params.expiresIn || 900, 1), 604800)
  const amzDate = getAmzDate(now)
  const dateStamp = amzDate.slice(0, 8)
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`
  const host = `${config.bucketName}.${config.endpointHost}`
  const canonicalUri = `/${encodeObjectKey(params.key)}`

  const canonicalHeaderEntries: Array<[string, string]> = [["host", host]]
  if (params.contentType) {
    canonicalHeaderEntries.push([
      "content-type",
      normalizeHeaderValue(params.contentType),
    ])
  }
  canonicalHeaderEntries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))

  const signedHeaders = canonicalHeaderEntries.map(([name]) => name).join(";")
  const canonicalHeaders = canonicalHeaderEntries
    .map(([name, value]) => `${name}:${value}\n`)
    .join("")

  const queryParameters: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${config.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": signedHeaders,
  }

  const canonicalQueryString = Object.entries(queryParameters)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&")

  const canonicalRequest = [
    params.method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n")

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n")

  const signature = createHmac(
    "sha256",
    getSigningKey(config.secretAccessKey, dateStamp)
  )
    .update(stringToSign, "utf8")
    .digest("hex")

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`
}

function getFileExtension(fileName: string, contentType: string) {
  const knownExtensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
  }
  const known = knownExtensions[contentType]
  if (known) return known

  const extension = fileName.split(".").pop()?.toLowerCase()
  return extension?.replace(/[^a-z0-9]/g, "").slice(0, 10) || "bin"
}

export function createR2ObjectKey(params: {
  userId: string
  fileName: string
  contentType: string
}) {
  const now = new Date()
  const year = String(now.getUTCFullYear())
  const month = String(now.getUTCMonth() + 1).padStart(2, "0")
  const extension = getFileExtension(params.fileName, params.contentType)

  return `${STORAGE_PREFIX}/${params.userId}/${year}/${month}/${randomUUID()}.${extension}`
}

export function getR2PublicUrl(key: string) {
  const { publicUrl } = getR2Config()
  return `${publicUrl}/${encodeObjectKey(key)}`
}

export function isR2DeliveryUrl(value: string) {
  try {
    const candidate = new URL(value)
    const publicBase = new URL(getR2Config().publicUrl)
    const basePath = publicBase.pathname.replace(/\/+$/, "")
    const expectedPathPrefix = `${basePath}/`.replace(/^\/\//, "/")

    return (
      candidate.protocol === "https:" &&
      candidate.origin === publicBase.origin &&
      candidate.pathname.startsWith(expectedPathPrefix)
    )
  } catch {
    return false
  }
}

export function getR2ObjectKeyFromUrl(value: string) {
  if (!isR2DeliveryUrl(value)) return null

  const candidate = new URL(value)
  const publicBase = new URL(getR2Config().publicUrl)
  const basePath = publicBase.pathname.replace(/\/+$/, "")
  const encodedKey = candidate.pathname.slice(`${basePath}/`.length)

  try {
    return encodedKey
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/")
  } catch {
    return null
  }
}

export function isR2ObjectOwnedByUser(key: string, userId: string) {
  return key.startsWith(`${STORAGE_PREFIX}/${userId}/`)
}

export async function headR2Object(key: string) {
  const response = await fetch(
    createR2PresignedUrl({ method: "HEAD", key, expiresIn: 60 }),
    {
      method: "HEAD",
      cache: "no-store",
    }
  )

  if (!response.ok) {
    throw new Error("O arquivo enviado não foi encontrado no Cloudflare R2")
  }

  return {
    contentType: response.headers.get("content-type") || "",
    contentLength: Number(response.headers.get("content-length") || 0),
  }
}

export async function deleteR2Object(key: string) {
  const response = await fetch(
    createR2PresignedUrl({ method: "DELETE", key, expiresIn: 60 }),
    {
      method: "DELETE",
      cache: "no-store",
    }
  )

  if (!response.ok) {
    throw new Error("Não foi possível remover o arquivo do Cloudflare R2")
  }
}
