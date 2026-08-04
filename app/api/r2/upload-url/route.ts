import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import {
  createR2ObjectKey,
  createR2PresignedUrl,
  getR2PublicUrl,
} from "@/lib/r2"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const FILE_RULES: Record<string, { maxSize: number; type: "image" | "video" }> = {
  "image/jpeg": { maxSize: 8 * 1024 * 1024, type: "image" },
  "video/mp4": { maxSize: 200 * 1024 * 1024, type: "video" },
  "video/quicktime": { maxSize: 200 * 1024 * 1024, type: "video" },
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const fileName = String(body.fileName || "").trim().slice(0, 255)
    const contentType = String(body.contentType || "").trim().toLowerCase()
    const size = Number(body.size)
    const rule = FILE_RULES[contentType]

    if (!fileName || !rule) {
      return NextResponse.json(
        { error: "Formato de arquivo não suportado." },
        { status: 400 }
      )
    }

    if (!Number.isFinite(size) || size <= 0 || size > rule.maxSize) {
      const limit = rule.type === "image" ? "8 MB" : "200 MB"
      return NextResponse.json(
        { error: `O arquivo excede o limite de ${limit}.` },
        { status: 400 }
      )
    }

    const objectKey = createR2ObjectKey({
      userId: session.user.id,
      fileName,
      contentType,
    })
    const uploadUrl = createR2PresignedUrl({
      method: "PUT",
      key: objectKey,
      contentType,
      expiresIn: 15 * 60,
    })

    return NextResponse.json({
      uploadUrl,
      objectKey,
      publicUrl: getR2PublicUrl(objectKey),
      contentType,
      expiresIn: 15 * 60,
    })
  } catch (error) {
    console.error("R2 upload URL error", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível preparar o upload.",
      },
      { status: 500 }
    )
  }
}
