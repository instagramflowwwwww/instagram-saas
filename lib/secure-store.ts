import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"

const VERSION = "v1"

function getKey() {
  const secret =
    process.env.INSTAGRAM_CREDENTIALS_SECRET ||
    process.env.INSTAGRAM_SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET

  if (!secret) {
    throw new Error(
      "INSTAGRAM_CREDENTIALS_SECRET, INSTAGRAM_SESSION_SECRET ou NEXTAUTH_SECRET não configurado"
    )
  }

  return createHash("sha256").update(secret).digest()
}

export function encryptValue(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [
    VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":")
}

export function decryptValue(value: string) {
  const [version, ivValue, authTagValue, encryptedValue] = value.split(":")

  if (
    version !== VERSION ||
    !ivValue ||
    !authTagValue ||
    !encryptedValue
  ) {
    throw new Error("Valor criptografado inválido")
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivValue, "base64url")
  )
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ])

  return decrypted.toString("utf8")
}

export function sealPayload(payload: Record<string, unknown>) {
  return encryptValue(JSON.stringify(payload))
}

export function openPayload<T extends Record<string, unknown>>(value: string) {
  return JSON.parse(decryptValue(value)) as T
}
