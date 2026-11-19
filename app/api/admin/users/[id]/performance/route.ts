import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { isAdminEmail } from "@/lib/account-access"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

// Mesmo teto da tela de Performance do usuário comum — sem isso, um usuário
// com centenas/milhares de posts travava a tela do admin inteira ao tentar
// renderizar a tabela de uma vez só.
const MAX_RESULTS = 300

function parseDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

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

  const requestUrl = new URL(request.url)
  const from = parseDate(requestUrl.searchParams.get("from"))
  const to = parseDate(requestUrl.searchParams.get("to"))
  const rawOffset = Number(requestUrl.searchParams.get("offset") || 0)
  const offset = Number.isInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0
  const createdAt =
    from || to
      ? { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) }
      : undefined

  const baseWhere = {
    status: "success",
    mediaId: { not: null },
    ...(createdAt ? { createdAt } : {}),
    post: { userId: targetUserId, publicationType: "post" },
  } as const

  // Totais do período inteiro (não só da página atual) numa consulta leve,
  // só com o número de views — é o que alimenta os cards de resumo.
  const allViewCounts = await prisma.postLog.findMany({
    where: baseWhere,
    select: { performanceViewsCount: true },
  })
  const withViewsCount = allViewCounts.filter((log) => log.performanceViewsCount !== null)
  const totalViews = withViewsCount.reduce((sum, log) => sum + (log.performanceViewsCount || 0), 0)

  const logs = await prisma.postLog.findMany({
    where: baseWhere,
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
      username: true,
      post: { select: { caption: true } },
      instagramAccount: { select: { username: true, profilePicture: true } },
    },
    // Views em ordem crescente (achar o que flopou primeiro) com NULLS LAST
    // explícito, e "id" como desempate pra manter a paginação estável.
    orderBy: [{ performanceViewsCount: { sort: "asc", nulls: "last" } }, { id: "asc" }],
    take: MAX_RESULTS + 1,
    skip: offset,
  })

  const hasMore = logs.length > MAX_RESULTS
  const pageLogs = hasMore ? logs.slice(0, MAX_RESULTS) : logs

  const posts = pageLogs.map((log) => ({
    id: log.id,
    username: log.instagramAccount?.username || log.username || "conta removida",
    profilePicture: log.instagramAccount?.profilePicture || null,
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
    {
      user,
      posts,
      postsTotal: allViewCounts.length,
      withViewsTotal: withViewsCount.length,
      totalViews,
      hasMore,
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  )
}
