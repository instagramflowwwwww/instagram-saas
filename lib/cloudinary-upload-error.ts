type CloudinaryErrorPayload = {
  error?: {
    message?: unknown
  }
}

export function getCloudinaryUploadError(
  payload: unknown,
  fallback: string
): string {
  const message =
    payload && typeof payload === "object"
      ? (payload as CloudinaryErrorPayload).error?.message
      : undefined

  if (typeof message !== "string" || !message.trim()) {
    return fallback
  }

  const normalized = message.trim()
  const lower = normalized.toLowerCase()

  if (lower.includes("uploading is disabled for")) {
    return "O Cloudinary bloqueou os uploads desta conta. Verifique o aviso no painel do Cloudinary ou atualize CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET com credenciais de uma conta ativa e faça um novo deploy."
  }

  if (lower.includes("invalid signature")) {
    return "A assinatura do Cloudinary é inválida. Confira CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET na Vercel e faça um novo deploy."
  }

  if (lower.includes("unknown api key") || lower.includes("invalid api key")) {
    return "A chave da API do Cloudinary é inválida. Atualize CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET na Vercel."
  }

  if (lower.includes("cloud name") && lower.includes("disabled")) {
    return "O ambiente do Cloudinary está desativado. Ative-o no painel ou configure credenciais de outro ambiente ativo."
  }

  return normalized
}
