import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { isAdminEmail } from "@/lib/account-access"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

// Só leitura: mostra o que já está salvo no banco (o mesmo dado que a
// própria tela de Performance do usuário exibiria). Não chama a Meta, não
// atualiza nada — é o admin olhando, não republicando nem re-sincronizando.
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const targetUserId = params.id

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true, email: true },
  })

  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 })
  }

  const logs = await prisma.postLog.findMany({
    where: {
      status: "success",
      mediaId: { not: null },
      post: { userId: targetUserId, publicationType: "post" },
    },
    select: {
      id: true,
      createdAt: true,
      performancePermalink: true,
      performanceLikeCount: true,
      performanceCommentsCount: true,
      performanceViewsCount: true,
      performanceViewsMetric: true,
      performanceMediaType: true,
      performanceMediaProductType: true,
      performancePublishedAt: true,
      performanceUpdatedAt: true,
      performanceError: true,
      post: { select: { caption: true } },
      instagramAccount: { select: { username: true, profilePicture: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  const posts = logs.map((log) => ({
    id: log.id,
    username: log.instagramAccount.username,
    profilePicture: log.instagramAccount.profilePicture,
    caption: log.post.caption,
    permalink: log.performancePermalink,
    likeCount: log.performanceLikeCount,
    commentsCount: log.performanceCommentsCount,
    viewsCount: log.performanceViewsCount,
    viewsMetric: log.performanceViewsMetric,
    mediaType: log.performanceMediaType,
    mediaProductType: log.performanceMediaProductType,
    publishedAt: log.performancePublishedAt || log.createdAt,
    performanceUpdatedAt: log.performanceUpdatedAt,
    error: log.performanceError,
  }))

  return NextResponse.json(
    { user, posts },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  )
}
