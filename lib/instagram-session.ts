import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"

const VERSION = "v1"

function getEncryptionKey() {
  const secret = process.env.INSTAGRAM_SESSION_SECRET || process.env.NEXTAUTH_SECRET

  if (!secret) {
    throw new Error("INSTAGRAM_SESSION_SECRET ou NEXTAUTH_SECRET não configurado")
  }

  return createHash("sha256").update(secret).digest()
}

export function encryptInstagramSession(session: Record<string, unknown>) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
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

export function decryptInstagramSession(value: string) {
  if (value.trim().startsWith("{")) {
    return JSON.parse(value) as Record<string, unknown>
  }

  const [version, ivValue, authTagValue, encryptedValue] = value.split(":")

  if (
    version !== VERSION ||
    !ivValue ||
    !authTagValue ||
    !encryptedValue
  ) {
    throw new Error("Sessão do Instagram inválida. Reconecte a conta.")
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivValue, "base64url")
  )

  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ])

  return JSON.parse(decrypted.toString("utf8")) as Record<string, unknown>
}
