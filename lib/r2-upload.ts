export type R2UploadResult = {
  objectKey: string
  publicUrl: string
  contentType: string
}

export async function uploadFileToR2(file: File): Promise<R2UploadResult> {
  const prepareResponse = await fetch("/api/r2/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    }),
  })
  const prepared = await prepareResponse.json()

  if (!prepareResponse.ok) {
    throw new Error(prepared.error || "Não foi possível preparar o upload")
  }

  const uploadResponse = await fetch(prepared.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": prepared.contentType },
    body: file,
  })

  if (!uploadResponse.ok) {
    throw new Error(
      uploadResponse.status === 403
        ? "O Cloudflare R2 recusou o upload. Confira o CORS e as credenciais configuradas."
        : "Não foi possível enviar o arquivo ao Cloudflare R2."
    )
  }

  return {
    objectKey: String(prepared.objectKey),
    publicUrl: String(prepared.publicUrl),
    contentType: String(prepared.contentType),
  }
}
