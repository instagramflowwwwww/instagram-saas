import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import {
  getMetaError,
  INSTAGRAM_GRAPH_VERSION,
  metaErrorMessage,
  readJsonResponse,
} from "@/lib/instagram-meta"
import { prisma } from "@/lib/prisma"
import { decryptValue } from "@/lib/secure-store"

export const runtime = "nodejs"

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const logs = await prisma.postLog.findMany({
    where: {
      status: "success",
      mediaId: { not: null },
      post: { userId: session.user.id },
      instagramAccount: {
        connectionType: "official",
      },
    },
    include: {
      post: true,
      instagramAccount: true,
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  })

  const results = await Promise.all(
    logs.map(async (log) => {
      try {
        if (!log.instagramAccount.accessToken) {
          throw new Error("Conta sem token oficial")
        }

        const accessToken = decryptValue(log.instagramAccount.accessToken)
        const url = new URL(
          `https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}/${log.mediaId}`
        )
        url.searchParams.set(
          "fields",
          "like_count,comments_count,media_type,media_product_type,permalink,timestamp"
        )
        url.searchParams.set("access_token", accessToken)

        const response = await fetch(url, { cache: "no-store" })
        const { payload } = await readJsonResponse(response)

        if (!response.ok || !payload) {
          throw new Error(metaErrorMessage(getMetaError(payload)))
        }

        return {
          id: log.id,
          username: log.instagramAccount.username,
          profilePicture: log.instagramAccount.profilePicture,
          caption: log.post.caption,
          permalink: payload.permalink || null,
          likeCount: payload.like_count ?? null,
          commentsCount: payload.comments_count ?? null,
          mediaType: payload.media_type || null,
          publishedAt: log.createdAt,
          error: null,
        }
      } catch (error) {
        return {
          id: log.id,
          username: log.instagramAccount.username,
          profilePicture: log.instagramAccount.profilePicture,
          caption: log.post.caption,
          permalink: null,
          likeCount: null,
          commentsCount: null,
          mediaType: null,
          publishedAt: log.createdAt,
          error:
            error instanceof Error
              ? error.message
              : "Não foi possível carregar",
        }
      }
    })
  )

  return NextResponse.json(results)
}
