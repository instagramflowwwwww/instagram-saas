import { createHash } from "crypto"

export type CloudinaryResourceType = "image" | "video"

function getCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary não configurado no servidor")
  }

  return { cloudName, apiKey, apiSecret }
}

function signCloudinaryParams(
  params: Record<string, string | number | boolean>,
  apiSecret: string
) {
  const serialized = Object.entries(params)
    .filter(([, value]) => value !== "" && value !== null && value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&")

  return createHash("sha1").update(`${serialized}${apiSecret}`).digest("hex")
}

export async function destroyCloudinaryAsset(params: {
  publicId: string
  resourceType: CloudinaryResourceType
}) {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig()
  const timestamp = Math.floor(Date.now() / 1000)
  const signedParams = {
    invalidate: true,
    public_id: params.publicId,
    timestamp,
  }
  const signature = signCloudinaryParams(signedParams, apiSecret)
  const body = new URLSearchParams({
    api_key: apiKey,
    invalidate: "true",
    public_id: params.publicId,
    signature,
    timestamp: String(timestamp),
  })

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${params.resourceType}/destroy`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  )
  const payload = (await response.json().catch(() => null)) as
    | { result?: string; error?: { message?: string } }
    | null

  if (!response.ok || !payload || !["ok", "not found"].includes(String(payload.result))) {
    throw new Error(
      payload?.error?.message || "Não foi possível remover o arquivo do Cloudinary"
    )
  }

  return payload.result
}

export function isCloudinaryDeliveryUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com"
  } catch {
    return false
  }
}
